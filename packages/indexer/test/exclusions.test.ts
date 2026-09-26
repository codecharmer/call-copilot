import { describe, expect, it } from 'vitest';

import { looksMinified, MINIFIED_LINE_LENGTH } from '../src/exclusions.js';

describe('looksMinified', () => {
  it('flags a file with one enormous line', () => {
    const bundle = `define("ace/mode/x",[],function(){${'var a=1;'.repeat(600)}});`;
    expect(bundle.length).toBeGreaterThan(MINIFIED_LINE_LENGTH);
    expect(looksMinified(bundle)).toBe(true);
  });

  it('flags a long final line without a trailing newline', () => {
    expect(looksMinified(`ok\n${'x'.repeat(MINIFIED_LINE_LENGTH + 1)}`)).toBe(true);
  });

  it('leaves ordinary source alone', () => {
    const source = Array.from({ length: 500 }, (_, i) => `const v${i} = compute(${i});`).join('\n');
    expect(looksMinified(source)).toBe(false);
  });

  it('leaves a long but hand-written file alone', () => {
    expect(looksMinified(`${'a'.repeat(MINIFIED_LINE_LENGTH)}\nb`)).toBe(false);
  });
});
