/**
 * Repository discovery: the walk that decides what gets indexed.
 *
 * DESIGN.md §6: "Resolve the selected root to a canonical path and keep all
 * reads inside that boundary. Ignore symlinks by default. Honor nested Git
 * ignore rules and a project-specific `.callcopilotignore` file... Show excluded
 * files and reasons; never silently describe an incomplete index as complete."
 *
 * Nothing in this module executes anything from the repository. It reads file
 * contents and directory entries; it never runs a script, a hook, or a build
 * (ADR 0007). Framework detection, when it arrives, reads manifests only.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { directoryExclusion, fileExclusion, looksBinary } from './exclusions.js';
import { decide, parseIgnoreFile, type IgnoreFile } from './ignore.js';
import { joinPosix, type CanonicalRoot } from './paths.js';

export type DiscoveredFile = {
  /** POSIX path relative to the repository root. */
  readonly relativePath: string;
  /** Absolute platform path, for reading. */
  readonly absolutePath: string;
  readonly sizeBytes: number;
  readonly language: string;
};

export type SkippedFile = {
  readonly relativePath: string;
  readonly reason: string;
  /** 'default' | '.gitignore' | '.callcopilotignore' | 'boundary' | 'size'. */
  readonly origin: string;
};

export type DiscoveryResult = {
  readonly files: DiscoveredFile[];
  readonly skipped: SkippedFile[];
};

export type DiscoveryOptions = {
  /** Files larger than this are skipped; huge files are almost never evidence. */
  readonly maxFileBytes: number;
  /** Hard cap so a mistaken root selection cannot walk a whole home directory. */
  readonly maxFiles: number;
  /** Extra ignore-file names honoured beyond `.gitignore`. */
  readonly ignoreFileNames: readonly string[];
};

export const DEFAULT_DISCOVERY_OPTIONS: DiscoveryOptions = {
  maxFileBytes: 1_000_000,
  maxFiles: 20_000,
  ignoreFileNames: ['.gitignore', '.callcopilotignore'],
};

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  ['ts', 'typescript'],
  ['tsx', 'typescript'],
  ['mts', 'typescript'],
  ['cts', 'typescript'],
  ['js', 'javascript'],
  ['jsx', 'javascript'],
  ['mjs', 'javascript'],
  ['cjs', 'javascript'],
  ['php', 'php'],
  ['py', 'python'],
  ['pyi', 'python'],
  ['rb', 'ruby'],
  ['go', 'go'],
  ['rs', 'rust'],
  ['java', 'java'],
  ['kt', 'kotlin'],
  ['cs', 'csharp'],
  ['swift', 'swift'],
  ['c', 'c'],
  ['h', 'c'],
  ['cpp', 'cpp'],
  ['cc', 'cpp'],
  ['hpp', 'cpp'],
  ['sh', 'shell'],
  ['bash', 'shell'],
  ['zsh', 'shell'],
  ['ps1', 'powershell'],
  ['sql', 'sql'],
  ['graphql', 'graphql'],
  ['gql', 'graphql'],
  ['css', 'css'],
  ['scss', 'scss'],
  ['sass', 'scss'],
  ['less', 'less'],
  ['html', 'html'],
  ['vue', 'vue'],
  ['svelte', 'svelte'],
  ['json', 'json'],
  ['jsonc', 'json'],
  ['yml', 'yaml'],
  ['yaml', 'yaml'],
  ['toml', 'toml'],
  ['ini', 'ini'],
  ['xml', 'xml'],
  ['md', 'markdown'],
  ['mdx', 'markdown'],
  ['rst', 'restructuredtext'],
  ['txt', 'text'],
]);

/**
 * Files worth indexing despite having no extension.
 *
 * Ignore files are deliberately absent. `.gitignore` and `.callcopilotignore`
 * describe what the index contains; they are not implementation evidence, and
 * indexing them would put the exclusion list itself into answers about the
 * software.
 */
const LANGUAGE_BY_FILENAME = new Map<string, string>([
  ['Dockerfile', 'dockerfile'],
  ['Makefile', 'makefile'],
  ['Procfile', 'text'],
  ['.env.example', 'dotenv'],
]);

export function detectLanguage(fileName: string): string | undefined {
  const byName = LANGUAGE_BY_FILENAME.get(fileName);
  if (byName) return byName;

  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return undefined;
  return LANGUAGE_BY_EXTENSION.get(fileName.slice(dot + 1).toLowerCase());
}

/**
 * Walk the repository, applying ignore rules and default exclusions.
 *
 * Directories are pruned rather than walked-then-filtered, so an excluded
 * `node_modules` costs one `readdir` entry instead of a hundred thousand.
 */
export async function discover(
  root: CanonicalRoot,
  options: DiscoveryOptions = DEFAULT_DISCOVERY_OPTIONS,
): Promise<DiscoveryResult> {
  const files: DiscoveredFile[] = [];
  const skipped: SkippedFile[] = [];

  await walk(root, '', [], files, skipped, options);

  files.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
  skipped.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
  return { files, skipped };
}

async function walk(
  root: CanonicalRoot,
  relativeDir: string,
  inheritedIgnores: readonly IgnoreFile[],
  files: DiscoveredFile[],
  skipped: SkippedFile[],
  options: DiscoveryOptions,
): Promise<void> {
  if (files.length >= options.maxFiles) return;

  const absoluteDir =
    relativeDir === '' ? root.absolute : join(root.absolute, ...relativeDir.split('/'));

  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    skipped.push({
      relativePath: relativeDir,
      reason: 'Directory could not be read.',
      origin: 'boundary',
    });
    return;
  }

  // Ignore files in this directory apply to it and everything beneath it, and
  // take precedence over rules inherited from shallower directories.
  const ignores = [...inheritedIgnores];
  for (const name of options.ignoreFileNames) {
    if (!entries.some((e) => e.isFile() && e.name === name)) continue;
    try {
      const contents = await readFile(join(absoluteDir, name), 'utf8');
      ignores.push(parseIgnoreFile(contents, relativeDir, name));
    } catch {
      // An unreadable ignore file is not fatal; the walk continues without it.
    }
  }

  const directories: string[] = [];

  for (const entry of entries) {
    if (files.length >= options.maxFiles) return;

    const relativePath = joinPosix(relativeDir, entry.name);

    // §6: "Ignore symlinks by default." A symlink can point outside the
    // canonical root, and following it would break the read boundary.
    if (entry.isSymbolicLink()) {
      skipped.push({ relativePath, reason: 'Symbolic link; not followed.', origin: 'boundary' });
      continue;
    }

    if (entry.isDirectory()) {
      // The user's rules are consulted first, so an explicit `!vendor/` can
      // override the built-in dependency exclusion. §6 requires that: asking
      // "what does the framework do here?" needs the framework's source.
      const verdict = decide(ignores, relativePath, true);
      if (verdict.ignored) {
        skipped.push({
          relativePath,
          reason: `Matched \`${verdict.rule?.source.trim()}\`.`,
          origin: verdict.origin ?? 'ignore',
        });
        continue;
      }

      if (!verdict.explicitlyIncluded) {
        const builtIn = directoryExclusion(entry.name);
        if (builtIn) {
          skipped.push({ relativePath, reason: builtIn.message, origin: 'default' });
          continue;
        }
      }

      directories.push(relativePath);
      continue;
    }

    if (!entry.isFile()) continue;

    const verdict = decide(ignores, relativePath, false);
    if (verdict.ignored) {
      skipped.push({
        relativePath,
        reason: `Matched \`${verdict.rule?.source.trim()}\`.`,
        origin: verdict.origin ?? 'ignore',
      });
      continue;
    }

    const builtIn = fileExclusion(relativePath);
    if (builtIn) {
      // An explicit `!` rule overrides the ordinary defaults, but never a
      // secret-bearing one. Re-including dependency source is a legitimate
      // request; putting a live `.env` or a private key into an evidence pack
      // sent to a cloud model is not, and a broad negation like `!*` must not
      // be able to do it by accident.
      const overridable = verdict.explicitlyIncluded && builtIn.category !== 'secret-bearing';
      if (!overridable) {
        skipped.push({ relativePath, reason: builtIn.message, origin: 'default' });
        continue;
      }
    }

    const language = detectLanguage(entry.name);
    if (language === undefined) {
      skipped.push({ relativePath, reason: 'Unrecognised file type.', origin: 'default' });
      continue;
    }

    const absolutePath = join(absoluteDir, entry.name);
    let sizeBytes: number;
    try {
      sizeBytes = (await stat(absolutePath)).size;
    } catch {
      skipped.push({ relativePath, reason: 'File could not be read.', origin: 'boundary' });
      continue;
    }

    if (sizeBytes > options.maxFileBytes) {
      skipped.push({
        relativePath,
        reason: `Larger than the ${Math.round(options.maxFileBytes / 1000)} kB limit.`,
        origin: 'size',
      });
      continue;
    }

    files.push({ relativePath, absolutePath, sizeBytes, language });
  }

  for (const dir of directories) {
    await walk(root, dir, ignores, files, skipped, options);
  }
}

/**
 * Read a discovered file as text, rejecting binary content that slipped past
 * the extension check.
 */
export async function readTextFile(file: DiscoveredFile): Promise<string | undefined> {
  const bytes = await readFile(file.absolutePath);
  if (looksBinary(bytes)) return undefined;
  return bytes.toString('utf8');
}
