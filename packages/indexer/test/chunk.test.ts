import { describe, expect, it } from 'vitest';

import {
  chunkByLines,
  chunkMarkdown,
  DEFAULT_CHUNK_OPTIONS,
  estimateTokens,
  type ChunkOptions,
} from '../src/chunk.js';
import { splitLines } from '../src/lines.js';

const SMALL: ChunkOptions = { maxTokens: 40, minTokens: 20, overlapLines: 2 };

function sourceOfLines(count: number): string {
  return Array.from({ length: count }, (_, i) => `const value${i} = compute(${i});`).join('\n');
}

describe('estimateTokens', () => {
  it('scales with length and never returns zero for non-empty text', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBeGreaterThan(0);
    expect(estimateTokens(sourceOfLines(50))).toBeGreaterThan(estimateTokens(sourceOfLines(5)));
  });
});

describe('chunkByLines', () => {
  it('returns one chunk for a file inside the budget', () => {
    const chunks = chunkByLines('const a = 1;\nconst b = 2;');
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks[0]?.endLine).toBe(2);
  });

  it('splits a long file into several chunks', () => {
    const chunks = chunkByLines(sourceOfLines(200), SMALL);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('produces line ranges that match the source exactly', () => {
    // The citation contract: chunk.text must be exactly lines start..end.
    const source = sourceOfLines(120);
    const split = splitLines(source);
    for (const chunk of chunkByLines(source, SMALL)) {
      const expected = split.lines.slice(chunk.startLine - 1, chunk.endLine).join('\n');
      expect(chunk.text).toBe(expected);
    }
  });

  it('covers every line of the file across its chunks', () => {
    const source = sourceOfLines(120);
    const chunks = chunkByLines(source, SMALL);
    const covered = new Set<number>();
    for (const c of chunks) {
      for (let l = c.startLine; l <= c.endLine; l += 1) covered.add(l);
    }
    expect(covered.size).toBe(splitLines(source).lines.length);
  });

  it('overlaps adjacent chunks so a split statement stays findable', () => {
    const chunks = chunkByLines(sourceOfLines(120), SMALL);
    expect(chunks.length).toBeGreaterThan(1);
    const first = chunks[0];
    const second = chunks[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second!.startLine).toBeLessThanOrEqual(first!.endLine);
  });

  it('always moves forward, even when one line exceeds the budget', () => {
    const giant = `const x = "${'y'.repeat(5000)}";`;
    const chunks = chunkByLines(`${giant}\nconst after = 1;`, SMALL);
    expect(chunks.length).toBeGreaterThan(0);
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i]!.startLine).toBeGreaterThan(chunks[i - 1]!.startLine);
    }
  });

  it('never splits inside a line', () => {
    const source = sourceOfLines(60);
    for (const chunk of chunkByLines(source, SMALL)) {
      expect(chunk.text.startsWith('const value')).toBe(true);
      expect(chunk.text.endsWith(';')).toBe(true);
    }
  });

  it('gives CRLF and LF versions of a file identical chunk line ranges', () => {
    const lf = sourceOfLines(80);
    const crlf = lf.split('\n').join('\r\n');
    const a = chunkByLines(lf, SMALL).map((c) => [c.startLine, c.endLine]);
    const b = chunkByLines(crlf, SMALL).map((c) => [c.startLine, c.endLine]);
    expect(b).toEqual(a);
  });

  it('respects the configured maximum reasonably closely', () => {
    for (const chunk of chunkByLines(sourceOfLines(200), SMALL)) {
      // A single oversized line is allowed to exceed the budget; nothing else is.
      const lines = chunk.endLine - chunk.startLine + 1;
      if (lines > 1) expect(chunk.estimatedTokens).toBeLessThanOrEqual(SMALL.maxTokens * 1.6);
    }
  });
});

describe('chunkMarkdown', () => {
  const doc = [
    '# Title',
    '',
    'Intro paragraph.',
    '',
    '## Setup',
    '',
    'Run the installer.',
    '',
    '### Windows',
    '',
    'Use corepack.',
    '',
    '## Usage',
    '',
    'Start the app.',
  ].join('\n');

  it('creates one chunk per heading section', () => {
    const chunks = chunkMarkdown(doc);
    expect(chunks.length).toBe(4);
  });

  it('records the heading trail for each section', () => {
    const chunks = chunkMarkdown(doc);
    expect(chunks[0]?.headingPath).toEqual(['Title']);
    expect(chunks[1]?.headingPath).toEqual(['Title', 'Setup']);
    expect(chunks[2]?.headingPath).toEqual(['Title', 'Setup', 'Windows']);
    expect(chunks[3]?.headingPath).toEqual(['Title', 'Usage']);
  });

  it('produces line ranges that match the source', () => {
    const split = splitLines(doc);
    for (const chunk of chunkMarkdown(doc)) {
      const expected = split.lines.slice(chunk.startLine - 1, chunk.endLine).join('\n');
      expect(chunk.text).toBe(expected);
    }
  });

  it('does not treat a # inside a fenced code block as a heading', () => {
    const withFence = ['# Real', '', '```bash', '# not a heading', 'echo hi', '```', ''].join('\n');
    const chunks = chunkMarkdown(withFence);
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.headingPath).toEqual(['Real']);
  });

  it('splits an oversized section further while keeping its heading path', () => {
    const long = ['# Big', '', sourceOfLines(200)].join('\n');
    const chunks = chunkMarkdown(long, SMALL);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.headingPath).toEqual(['Big']);
    }
  });

  it('uses the documented defaults', () => {
    expect(DEFAULT_CHUNK_OPTIONS.maxTokens).toBe(900);
    expect(DEFAULT_CHUNK_OPTIONS.minTokens).toBe(400);
  });
});

describe('empty and whitespace-only input', () => {
  it('produces no chunks for an empty file', () => {
    expect(chunkByLines('')).toEqual([]);
  });

  it('produces no chunks for a whitespace-only file', () => {
    // These cost an embedding and match nothing; they are not evidence.
    expect(chunkByLines('\n\n   \n\t\n')).toEqual([]);
  });

  it('produces no chunks for a Markdown file with no content', () => {
    expect(chunkMarkdown('\n\n')).toEqual([]);
  });
});
