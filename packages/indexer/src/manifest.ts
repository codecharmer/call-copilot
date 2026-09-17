/**
 * Content hashing and index generation manifests.
 *
 * DESIGN.md §6: "Publish each index generation atomically. A generation is an
 * immutable manifest mapping files to their indexed content hashes. It may
 * reference unchanged chunks from earlier generations. It is not a guarantee of
 * a filesystem-wide atomic snapshot; changed files must be revalidated during
 * ingestion."
 *
 * The manifest is what makes a citation verifiable later: an answer records the
 * generation it used, and the generation records the exact bytes of every file
 * it indexed. When the user clicks a source after editing the file, the app can
 * say "this is what the code looked like when I answered" and prove it.
 */

import { createHash } from 'node:crypto';

import type { GitSnapshot } from '@call-copilot/contracts';

/** A file as recorded in one generation. */
export type ManifestEntry = {
  /** POSIX path relative to the repository root. */
  readonly relativePath: string;
  /** SHA-256 of the file's raw bytes, before redaction. */
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly language: string;
  /** Chunk IDs produced from this file, in document order. */
  readonly chunkIds: string[];
};

/** A file the walk saw but did not index, with the reason shown to the user. */
export type ExcludedEntry = {
  readonly relativePath: string;
  readonly reason: string;
  readonly origin: string;
};

export type Manifest = {
  readonly generationId: string;
  readonly repositoryId: string;
  readonly createdAtMs: number;
  readonly git?: GitSnapshot;
  readonly files: readonly ManifestEntry[];
  readonly excluded: readonly ExcludedEntry[];
  /** Versions that invalidate reuse when they change. */
  readonly versions: {
    readonly chunker: string;
    readonly parser: string;
    readonly embedding: string;
  };
};

/** SHA-256 of raw bytes, hex encoded. Hashing bytes, not decoded text, so a
 * CRLF checkout and an LF checkout are correctly seen as different files. */
export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Deterministic chunk ID.
 *
 * Derived from content and position rather than a counter, so re-indexing an
 * unchanged file produces the same IDs and the previous generation's embeddings
 * can be reused without recomputation.
 */
export function chunkId(
  relativePath: string,
  contentHash: string,
  startLine: number,
  endLine: number,
): string {
  return createHash('sha256')
    .update(`${relativePath}\0${contentHash}\0${startLine}\0${endLine}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Deterministic generation ID.
 *
 * Two indexing runs over identical content with identical versions produce the
 * same generation ID. That makes "has anything actually changed?" a string
 * comparison, and makes cache keys stable across restarts.
 */
export function generationId(
  repositoryId: string,
  files: readonly ManifestEntry[],
  versions: Manifest['versions'],
): string {
  const hash = createHash('sha256');
  hash.update(repositoryId);
  hash.update(`\0${versions.chunker}\0${versions.parser}\0${versions.embedding}`);

  // Sorted so filesystem enumeration order cannot change the ID.
  const sorted = [...files].sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
  for (const file of sorted) {
    hash.update(`\0${file.relativePath}\0${file.contentHash}`);
  }

  return hash.digest('hex').slice(0, 32);
}

/**
 * Which files changed between two generations.
 *
 * Drives incremental reindexing: only `added` and `modified` need parsing and
 * embedding, and `removed` must be deleted from both search indexes (§6).
 */
export function diffManifests(
  previous: Manifest | undefined,
  next: Manifest,
): { added: string[]; modified: string[]; removed: string[]; unchanged: string[] } {
  const before = new Map((previous?.files ?? []).map((f) => [f.relativePath, f.contentHash]));
  const after = new Map(next.files.map((f) => [f.relativePath, f.contentHash]));

  const added: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];
  const removed: string[] = [];

  for (const [path, hash] of after) {
    const prior = before.get(path);
    if (prior === undefined) added.push(path);
    else if (prior !== hash) modified.push(path);
    else unchanged.push(path);
  }

  for (const path of before.keys()) {
    if (!after.has(path)) removed.push(path);
  }

  return { added, modified, removed, unchanged };
}
