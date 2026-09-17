/**
 * Chunking: line-based fallback and Markdown heading chunking.
 *
 * DESIGN.md §6: "For unsupported languages or parse failures, fall back to
 * overlapping line-based chunks. Start with approximately 400–900 tokens per
 * chunk and a bounded overlap for oversized blocks. Documentation is chunked by
 * headings. These sizes require retrieval evaluation before release."
 *
 * Symbol-boundary chunking arrives with tree-sitter. This module is the
 * fallback path, and it also handles every unsupported language, so it is not
 * a placeholder — it is what most of a mixed repository goes through.
 *
 * The sizes here are the design's starting defaults, exposed as options
 * because §6 requires evaluating them before release rather than assuming them.
 */

import { splitLines } from './lines.js';

export type ChunkDraft = {
  /** 1-based, inclusive. */
  readonly startLine: number;
  /** 1-based, inclusive. */
  readonly endLine: number;
  readonly text: string;
  /** Approximate token count; see `estimateTokens`. */
  readonly estimatedTokens: number;
  /** Heading trail for documentation chunks, e.g. ['Setup', 'Windows']. */
  readonly headingPath?: string[];
};

export type ChunkOptions = {
  /** Target upper bound in tokens. DESIGN.md §6 proposes 400–900. */
  readonly maxTokens: number;
  /** Below this, a chunk is merged forward rather than stored alone. */
  readonly minTokens: number;
  /** Lines repeated between adjacent chunks so a split statement stays findable. */
  readonly overlapLines: number;
};

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxTokens: 900,
  minTokens: 400,
  overlapLines: 6,
};

/**
 * Approximate a token count without pulling in a tokenizer.
 *
 * Roughly four characters per token is the common English heuristic; code runs
 * denser because of punctuation and identifiers, so this leans conservative by
 * also counting word-ish runs. It exists to keep chunks inside a budget, not to
 * bill anyone. The real tokenizer replaces it when the answer model is pinned,
 * and the evidence budget in §8 must use that one, not this.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  const byChars = text.length / 4;
  const byWords = (text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? []).length;
  return Math.max(1, Math.round((byChars + byWords) / 2));
}

/**
 * Split source text into overlapping line-based chunks.
 *
 * Splits are taken at line boundaries so every chunk's line range is exact and
 * citable. A single line longer than the budget is emitted on its own rather
 * than being cut mid-line, which would corrupt the citation.
 */
export function chunkByLines(
  text: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): ChunkDraft[] {
  const { lines } = splitLines(text);
  // An empty or whitespace-only file yields no chunks. `splitLines` reports one
  // empty line for '' because that is what an editor shows, but an empty chunk
  // is not evidence: it would cost an embedding and match nothing useful.
  if (lines.length === 0) return [];
  if (lines.every((line) => line.trim().length === 0)) return [];

  const chunks: ChunkDraft[] = [];
  let startIndex = 0;

  while (startIndex < lines.length) {
    let endIndex = startIndex;
    let tokens = 0;

    while (endIndex < lines.length) {
      const lineTokens = estimateTokens(lines[endIndex] as string) + 1;
      if (tokens > 0 && tokens + lineTokens > options.maxTokens) break;
      tokens += lineTokens;
      endIndex += 1;
    }

    // Guarantee forward progress even when one line exceeds the budget.
    if (endIndex === startIndex) endIndex = startIndex + 1;

    const body = lines.slice(startIndex, endIndex);
    chunks.push({
      startLine: startIndex + 1,
      endLine: endIndex,
      text: body.join('\n'),
      estimatedTokens: estimateTokens(body.join('\n')),
    });

    if (endIndex >= lines.length) break;

    // Step back by the overlap, without ever moving backwards overall.
    const next = Math.max(startIndex + 1, endIndex - options.overlapLines);
    startIndex = next;
  }

  return mergeUndersizedTail(chunks, options);
}

/**
 * A trailing chunk far below the minimum is folded into its predecessor, so a
 * file does not end with a two-line fragment that carries no context.
 */
function mergeUndersizedTail(chunks: ChunkDraft[], options: ChunkOptions): ChunkDraft[] {
  if (chunks.length < 2) return chunks;

  const last = chunks[chunks.length - 1] as ChunkDraft;
  const previous = chunks[chunks.length - 2] as ChunkDraft;
  if (last.estimatedTokens >= options.minTokens / 4) return chunks;

  const merged = previous.estimatedTokens + last.estimatedTokens;
  if (merged > options.maxTokens * 1.5) return chunks;

  const head = chunks.slice(0, -2);
  head.push({
    startLine: previous.startLine,
    endLine: last.endLine,
    text: `${previous.text}\n${last.text}`,
    estimatedTokens: merged,
  });
  return head;
}

const HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * Chunk Markdown by heading, keeping the heading trail as metadata.
 *
 * A section longer than the budget is split further by lines, and every piece
 * keeps the same heading path so retrieval can still say where it came from.
 */
export function chunkMarkdown(
  text: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): ChunkDraft[] {
  const { lines } = splitLines(text);
  const chunks: ChunkDraft[] = [];

  const trail: string[] = [];
  let sectionStart = 0;
  let sectionPath: string[] = [];
  let inFence = false;

  const flush = (endIndexExclusive: number): void => {
    if (endIndexExclusive <= sectionStart) return;
    const body = lines.slice(sectionStart, endIndexExclusive);
    if (body.every((l) => l.trim().length === 0)) return;

    const joined = body.join('\n');
    const path = [...sectionPath];

    if (estimateTokens(joined) <= options.maxTokens) {
      chunks.push({
        startLine: sectionStart + 1,
        endLine: endIndexExclusive,
        text: joined,
        estimatedTokens: estimateTokens(joined),
        headingPath: path,
      });
      return;
    }

    for (const piece of chunkByLines(joined, options)) {
      chunks.push({
        startLine: sectionStart + piece.startLine,
        endLine: sectionStart + piece.endLine,
        text: piece.text,
        estimatedTokens: piece.estimatedTokens,
        headingPath: path,
      });
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;

    // A `#` inside a fenced code block is code, not a heading.
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;

    const match = HEADING.exec(line);
    if (!match) continue;

    flush(i);

    const depth = (match[1] as string).length;
    const title = (match[2] as string).trim();
    trail.length = Math.min(trail.length, depth - 1);
    trail[depth - 1] = title;
    sectionPath = trail.slice(0, depth).map((t) => t ?? '');
    sectionStart = i;
  }

  flush(lines.length);
  return chunks;
}
