#!/usr/bin/env node
/**
 * ccinspect — a diagnostic CLI over @call-copilot/indexer.
 *
 * This is not a product surface from DESIGN.md. It exists because the
 * ingestion core (discovery, ignore rules, exclusions, secret redaction,
 * chunking, generation hashing) had only ever been run against synthetic
 * temp-directory fixtures in vitest. Pointing it at a real, arbitrarily messy
 * folder — especially on Windows, where paths, line endings and permissions
 * genuinely differ from macOS — is the fastest way to find what the unit
 * tests could not: surprises in a real filesystem.
 *
 * Usage:
 *   ccinspect <path> [--verbose] [--json] [--limit N]
 *
 * Exit code is 0 on a normal run (even one that finds secrets or excludes
 * everything) and 1 only when the given path cannot be resolved as a
 * directory. Finding problems in a repository is not a CLI failure; failing
 * to read the repository at all is.
 */

import { performance } from 'node:perf_hooks';

import {
  chunkByLines,
  chunkMarkdown,
  discover,
  generationId,
  hashText,
  readTextFile,
  redactSecrets,
  resolveRoot,
  type ChunkDraft,
  type DiscoveredFile,
  type ManifestEntry,
  type SkippedFile,
} from '@call-copilot/indexer';

type Options = {
  readonly path: string;
  readonly verbose: boolean;
  readonly json: boolean;
  readonly limit: number;
};

function parseArgs(argv: readonly string[]): Options | undefined {
  const positionals: string[] = [];
  let verbose = false;
  let json = false;
  let limit = 15;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--limit') {
      const value = argv[i + 1];
      if (value === undefined || Number.isNaN(Number(value))) return undefined;
      limit = Number(value);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      return undefined;
    } else if (arg.startsWith('-')) {
      return undefined;
    } else {
      positionals.push(arg);
    }
  }

  const path = positionals[0];
  if (path === undefined) return undefined;
  return { path, verbose, json, limit };
}

function printUsage(): void {
  console.log(
    [
      'ccinspect — run the Codebase Call Copilot ingestion core against a real folder.',
      '',
      'Usage:',
      '  ccinspect <path> [--verbose] [--json] [--limit N]',
      '',
      'Options:',
      '  --verbose, -v   List every excluded file, not just a summary by reason.',
      '  --json          Print a single machine-readable JSON summary instead of text.',
      '  --limit N       How many sample files/findings to print per section (default 15).',
      '',
      'Examples:',
      '  ccinspect .',
      '  ccinspect ../some-other-repo --verbose',
    ].join('\n'),
  );
}

type SecretHit = {
  readonly relativePath: string;
  readonly line: number;
  readonly rule: string;
};

type IndexedFile = {
  readonly file: DiscoveredFile;
  readonly contentHash: string;
  readonly chunks: ChunkDraft[];
  readonly estimatedTokens: number;
};

async function run(options: Options): Promise<number> {
  let root;
  try {
    root = resolveRoot(options.path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ccinspect: could not resolve "${options.path}" as a directory.`);
    console.error(`  ${message}`);
    return 1;
  }

  const startedAt = performance.now();
  const { files, skipped } = await discover(root);
  const discoveredAt = performance.now();

  const indexed: IndexedFile[] = [];
  const unreadable: DiscoveredFile[] = [];
  const secretHits: SecretHit[] = [];

  for (const file of files) {
    const raw = await readTextFile(file);
    if (raw === undefined) {
      unreadable.push(file);
      continue;
    }

    const { text, findings } = redactSecrets(raw);
    for (const finding of findings) {
      secretHits.push({ relativePath: file.relativePath, line: finding.line, rule: finding.rule });
    }

    const chunks = file.language === 'markdown' ? chunkMarkdown(text) : chunkByLines(text);
    const estimatedTokens = chunks.reduce((sum, c) => sum + c.estimatedTokens, 0);

    indexed.push({ file, contentHash: hashText(text), chunks, estimatedTokens });
  }

  const chunkedAt = performance.now();

  // The same generation-manifest math the real indexer will use, run here on
  // whatever got chunked. Two runs over an unmodified folder must print the
  // same ID; editing one file must change it. That invariant is exactly what
  // makes an index generation trustworthy as a citation target (DESIGN.md §6).
  const manifestEntries: ManifestEntry[] = indexed.map(({ file, contentHash, chunks }) => ({
    relativePath: file.relativePath,
    contentHash,
    sizeBytes: file.sizeBytes,
    language: file.language,
    chunkIds: chunks.map((_, i) => `${contentHash.slice(0, 8)}-${i}`),
  }));
  const generation = generationId('ccinspect', manifestEntries, {
    chunker: '1',
    parser: 'line-fallback-only', // tree-sitter is not wired up yet
    embedding: 'none',
  });

  const elapsedMs = performance.now() - startedAt;

  const bySkipOrigin = groupCount(skipped, (s) => s.origin);
  const byLanguage = groupCount(
    indexed.map((i) => i.file),
    (f) => f.language,
  );
  const totalChunks = indexed.reduce((sum, i) => sum + i.chunks.length, 0);
  const totalTokens = indexed.reduce((sum, i) => sum + i.estimatedTokens, 0);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          root: root.absolute,
          generationId: generation,
          timingMs: {
            discover: round(discoveredAt - startedAt),
            chunk: round(chunkedAt - discoveredAt),
            total: round(elapsedMs),
          },
          files: {
            indexed: indexed.length,
            skipped: skipped.length,
            unreadable: unreadable.length,
          },
          chunks: { total: totalChunks, estimatedTokens: totalTokens },
          skippedByOrigin: bySkipOrigin,
          indexedByLanguage: byLanguage,
          secretFindings: secretHits,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  printReport({
    root: root.absolute,
    generation,
    elapsedMs,
    discoverMs: discoveredAt - startedAt,
    chunkMs: chunkedAt - discoveredAt,
    indexed,
    skipped,
    unreadable,
    secretHits,
    bySkipOrigin,
    byLanguage,
    totalChunks,
    totalTokens,
    options,
  });

  return 0;
}

function groupCount<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

function sortedEntries(counts: Record<string, number>): Array<[string, number]> {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function printReport(input: {
  root: string;
  generation: string;
  elapsedMs: number;
  discoverMs: number;
  chunkMs: number;
  indexed: IndexedFile[];
  skipped: SkippedFile[];
  unreadable: DiscoveredFile[];
  secretHits: SecretHit[];
  bySkipOrigin: Record<string, number>;
  byLanguage: Record<string, number>;
  totalChunks: number;
  totalTokens: number;
  options: Options;
}): void {
  const { options } = input;
  const line = '─'.repeat(60);

  console.log(line);
  console.log(`ccinspect: ${input.root}`);
  console.log(line);
  console.log(
    `Indexed ${input.indexed.length} file(s), skipped ${input.skipped.length}` +
      (input.unreadable.length > 0
        ? `, ${input.unreadable.length} looked binary despite their extension`
        : '') +
      ` — in ${round(input.elapsedMs)} ms (discovery ${round(input.discoverMs)} ms, chunking ${round(input.chunkMs)} ms).`,
  );
  console.log(`Chunks: ${input.totalChunks}  ·  Estimated tokens: ${input.totalTokens}`);
  console.log(`Generation ID: ${input.generation}`);
  console.log(
    '  (same folder, unmodified, run twice → identical ID; edit one file → a different one.)',
  );

  console.log('');
  console.log('By language:');
  for (const [lang, count] of sortedEntries(input.byLanguage).slice(0, options.limit)) {
    console.log(`  ${count.toString().padStart(5)}  ${lang}`);
  }

  console.log('');
  console.log('Skipped, by reason category:');
  if (Object.keys(input.bySkipOrigin).length === 0) {
    console.log('  (nothing skipped)');
  }
  for (const [origin, count] of sortedEntries(input.bySkipOrigin)) {
    console.log(`  ${count.toString().padStart(5)}  ${origin}`);
  }

  if (options.verbose) {
    console.log('');
    console.log('Every skipped path:');
    for (const s of input.skipped) {
      console.log(`  ${s.relativePath}  —  ${s.reason}  [${s.origin}]`);
    }
  } else if (input.skipped.length > 0) {
    console.log('');
    console.log(
      `Sample of skipped paths (first ${Math.min(options.limit, input.skipped.length)}):`,
    );
    for (const s of input.skipped.slice(0, options.limit)) {
      console.log(`  ${s.relativePath}  —  ${s.reason}`);
    }
  }

  console.log('');
  console.log(`Sample of indexed files (first ${Math.min(options.limit, input.indexed.length)}):`);
  for (const item of input.indexed.slice(0, options.limit)) {
    console.log(
      `  ${item.file.relativePath}  [${item.file.language}]  ` +
        `${item.chunks.length} chunk(s), ~${item.estimatedTokens} tokens`,
    );
  }

  console.log('');
  if (input.secretHits.length === 0) {
    console.log('Secret filter: no matches.');
  } else {
    console.log(`Secret filter: ${input.secretHits.length} finding(s). Values are never printed.`);
    for (const hit of input.secretHits.slice(0, options.limit)) {
      console.log(`  ${hit.relativePath}:${hit.line}  [${hit.rule}]`);
    }
  }

  console.log(line);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options === undefined) {
    printUsage();
    process.exitCode = process.argv.slice(2).some((a) => a === '--help' || a === '-h') ? 0 : 1;
    return;
  }

  process.exitCode = await run(options);
}

main().catch((error: unknown) => {
  console.error('ccinspect: unexpected error.');
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
