/**
 * Path handling for the repository boundary.
 *
 * Two rules hold everywhere in the indexer:
 *
 * 1. **Every stored path is POSIX-shaped and relative to the repository root.**
 *    A chunk indexed on Windows and the same chunk indexed on macOS must carry
 *    byte-identical `relativePath` values, or citations, cache keys and index
 *    generations stop matching across machines.
 * 2. **Nothing outside the canonical root is ever read.** The root is resolved
 *    through symlinks once, and every candidate path is checked against it.
 *
 * DESIGN.md §6: "Resolve the selected root to a canonical path and keep all
 * reads inside that boundary. Ignore symlinks by default."
 */

import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** A repository root that has been resolved through symlinks exactly once. */
export type CanonicalRoot = {
  /** Absolute, symlink-resolved, platform-shaped. Used for filesystem calls. */
  readonly absolute: string;
  /** True when path comparison must ignore case (win32, and darwin by default). */
  readonly caseInsensitive: boolean;
};

/**
 * Windows and macOS default to case-insensitive filesystems; Linux does not.
 * This only affects *containment* checks. Ignore-rule matching stays
 * case-sensitive on every platform so one repository produces one index.
 */
function platformIsCaseInsensitive(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'darwin';
}

export function resolveRoot(
  inputPath: string,
  platform: NodeJS.Platform = process.platform,
): CanonicalRoot {
  const absolute = realpathSync(resolve(inputPath));
  return { absolute, caseInsensitive: platformIsCaseInsensitive(platform) };
}

/**
 * Convert a platform path to the POSIX relative form stored in the index.
 *
 * Returns `undefined` when the path escapes the root, which is the signal to
 * refuse the read rather than to fall back to something permissive.
 */
export function toRelativePosix(root: CanonicalRoot, absolutePath: string): string | undefined {
  if (!isAbsolute(absolutePath)) return undefined;
  if (!isInsideRoot(root, absolutePath)) return undefined;

  const rel = relative(root.absolute, absolutePath);
  if (rel === '') return '';
  return rel.split(sep).join('/');
}

/**
 * True when `absolutePath` is the root itself or lies beneath it.
 *
 * The string prefix check is deliberately done on segment boundaries. A plain
 * `startsWith` would accept `/repo-backup` as being inside `/repo`.
 */
export function isInsideRoot(root: CanonicalRoot, absolutePath: string): boolean {
  const rel = relative(root.absolute, absolutePath);

  // `relative` returns '' for the root itself, and a path starting with '..'
  // for anything above it. On Windows it returns an absolute path when the two
  // paths sit on different drives.
  if (rel === '') return true;
  if (isAbsolute(rel)) return false;
  if (rel === '..') return false;
  if (rel.startsWith(`..${sep}`)) return false;
  return true;
}

/**
 * Compare two absolute paths under the root's case rules.
 *
 * Case folding uses `toLowerCase()`, which is a deliberate simplification: it
 * is correct for ASCII paths and for the overwhelming majority of real ones.
 * It is not a substitute for the OS's own Unicode case-folding table, so it is
 * never used to decide whether a read is permitted, only to compare paths we
 * have already resolved.
 */
export function pathsEqual(root: CanonicalRoot, a: string, b: string): boolean {
  return root.caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** Split a POSIX relative path into segments, dropping empties. */
export function segments(relativePosix: string): string[] {
  return relativePosix.split('/').filter((s) => s.length > 0);
}

/** The final segment of a POSIX relative path. */
export function basenamePosix(relativePosix: string): string {
  const parts = segments(relativePosix);
  return parts.length === 0 ? '' : (parts[parts.length - 1] as string);
}

/** The directory portion of a POSIX relative path, or '' at the top level. */
export function dirnamePosix(relativePosix: string): string {
  const parts = segments(relativePosix);
  return parts.length <= 1 ? '' : parts.slice(0, -1).join('/');
}

/** Join POSIX relative path parts, tolerating '' for the root. */
export function joinPosix(...parts: string[]): string {
  return parts.filter((p) => p.length > 0).join('/');
}
