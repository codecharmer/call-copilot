import { describe, expect, it } from 'vitest';

import { offsetToLine, sliceLines, splitLines } from '../src/lines.js';

describe('splitLines', () => {
  it('splits LF text', () => {
    expect(splitLines('a\nb\nc').lines).toEqual(['a', 'b', 'c']);
  });

  it('splits CRLF text without leaving carriage returns in the content', () => {
    // The Windows case: a \r left on the line would appear in every citation.
    const split = splitLines('a\r\nb\r\nc');
    expect(split.lines).toEqual(['a', 'b', 'c']);
    expect(split.usedCrlf).toBe(true);
  });

  it('gives CRLF and LF versions of a file the same line numbers', () => {
    const lf = splitLines('one\ntwo\nthree\nfour');
    const crlf = splitLines('one\r\ntwo\r\nthree\r\nfour');
    expect(crlf.lines).toEqual(lf.lines);
    expect(crlf.lines.length).toBe(4);
  });

  it('splits lone carriage returns', () => {
    expect(splitLines('a\rb').lines).toEqual(['a', 'b']);
  });

  it('does not invent a trailing empty line', () => {
    // An editor shows "a\n" as one line, so a citation must agree.
    expect(splitLines('a\n').lines).toEqual(['a']);
    expect(splitLines('a\r\n').lines).toEqual(['a']);
  });

  it('strips a UTF-8 BOM from line 1', () => {
    const split = splitLines('﻿import x from "y";');
    expect(split.hadBom).toBe(true);
    expect(split.lines[0]).toBe('import x from "y";');
  });

  it('returns a single empty line for empty input', () => {
    expect(splitLines('').lines).toEqual(['']);
  });

  it('keeps multi-byte characters intact and does not miscount lines', () => {
    const split = splitLines('const emoji = "👋";\nconst cjk = "日本語";');
    expect(split.lines.length).toBe(2);
    expect(split.lines[0]).toContain('👋');
    expect(split.lines[1]).toContain('日本語');
  });
});

describe('sliceLines', () => {
  const split = splitLines('l1\nl2\nl3\nl4\nl5');

  it('extracts an inclusive 1-based range', () => {
    expect(sliceLines(split, 2, 4)).toBe('l2\nl3\nl4');
  });

  it('extracts a single line', () => {
    expect(sliceLines(split, 3, 3)).toBe('l3');
  });

  it('clamps a range that runs past the end of an edited file', () => {
    // A stale citation must still render something rather than throwing.
    expect(sliceLines(split, 4, 99)).toBe('l4\nl5');
    expect(sliceLines(split, 0, 2)).toBe('l1\nl2');
  });
});

describe('offsetToLine', () => {
  it('maps offsets to 1-based line numbers in LF text', () => {
    const text = 'aa\nbb\ncc';
    expect(offsetToLine(text, 0)).toBe(1);
    expect(offsetToLine(text, 3)).toBe(2);
    expect(offsetToLine(text, 6)).toBe(3);
  });

  it('counts a CRLF pair as one line break', () => {
    const text = 'aa\r\nbb\r\ncc';
    expect(offsetToLine(text, 0)).toBe(1);
    expect(offsetToLine(text, 4)).toBe(2);
    expect(offsetToLine(text, 8)).toBe(3);
  });

  it('clamps out-of-range offsets', () => {
    expect(offsetToLine('a\nb', 999)).toBe(2);
    expect(offsetToLine('a\nb', -5)).toBe(1);
  });
});
