/**
 * Line splitting that produces the line numbers a user sees in their editor.
 *
 * DESIGN.md §6: "Convert parser offsets into correct user-visible line numbers
 * for CRLF and Unicode files."
 *
 * This is the module Windows makes necessary. A repository checked out on
 * Windows may contain CRLF endings; the same repository on macOS may not. A
 * citation that says "lines 40-52" has to mean the same twelve lines either
 * way, and the excerpt shown to the user has to be the text they would see.
 *
 * Three hazards handled here:
 *
 * - **CRLF**: the `\r` belongs to the line ending, not the line content.
 * - **Lone CR** (classic Mac, and some generated files): also a line ending.
 * - **BOM**: a leading U+FEFF is not part of line 1's content.
 *
 * Astral-plane characters (emoji, some CJK) are left alone deliberately: line
 * *numbers* are unaffected by them, and slicing by JavaScript string index is
 * consistent as long as every consumer uses the same indices, which they do.
 */

export type SplitText = {
  /** Line contents without their terminators. Index 0 is line 1. */
  readonly lines: string[];
  /** True when the file used CRLF for the majority of its line endings. */
  readonly usedCrlf: boolean;
  /** True when a UTF-8 BOM was stripped from the start. */
  readonly hadBom: boolean;
};

const BOM = '﻿';

/**
 * Split text into lines, accepting LF, CRLF and lone CR terminators.
 *
 * A trailing newline does not produce a final empty line, matching what editors
 * display: a file ending in `"a\n"` has one line, not two.
 */
export function splitLines(input: string): SplitText {
  const hadBom = input.startsWith(BOM);
  const text = hadBom ? input.slice(BOM.length) : input;

  const lines: string[] = [];
  let crlf = 0;
  let lf = 0;
  let start = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') {
      lines.push(text.slice(start, i));
      lf += 1;
      i += 1;
      start = i;
      continue;
    }
    if (ch === '\r') {
      lines.push(text.slice(start, i));
      if (text[i + 1] === '\n') {
        crlf += 1;
        i += 2;
      } else {
        crlf += 1; // lone CR counted with CRLF for the "not LF" majority test
        i += 1;
      }
      start = i;
      continue;
    }
    i += 1;
  }

  if (start < text.length) {
    lines.push(text.slice(start));
  } else if (lines.length === 0) {
    lines.push('');
  }

  return { lines, usedCrlf: crlf > lf, hadBom };
}

/**
 * Extract an inclusive 1-based line range, as a citation renders it.
 *
 * Out-of-range values are clamped rather than throwing: a stale citation
 * against an edited file must still show something, and the caller is
 * responsible for telling the user the file changed.
 */
export function sliceLines(split: SplitText, startLine: number, endLine: number): string {
  const first = Math.max(1, Math.min(startLine, split.lines.length));
  const last = Math.max(first, Math.min(endLine, split.lines.length));
  return split.lines.slice(first - 1, last).join('\n');
}

/**
 * Convert a 0-based character offset into a 1-based line number.
 *
 * Used to turn parser offsets into user-visible line numbers. The offset is
 * interpreted against the text *after* BOM stripping, which is what parsers
 * are given.
 */
export function offsetToLine(text: string, offset: number): number {
  const limit = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let i = 0;
  while (i < limit) {
    const ch = text[i];
    if (ch === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (ch === '\r') {
      line += 1;
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    i += 1;
  }
  return line;
}
