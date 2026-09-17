import { describe, expect, it } from 'vitest';

import { compileRule, decide, parseIgnoreFile, type IgnoreFile } from '../src/ignore.js';

/** Build a single-file rule stack rooted at the repository root. */
function rules(...lines: string[]): IgnoreFile[] {
  return [parseIgnoreFile(lines.join('\n'), '', '.gitignore')];
}

function ignored(files: IgnoreFile[], path: string, isDir = false): boolean {
  return decide(files, path, isDir).ignored;
}

describe('compileRule', () => {
  it('skips blanks and comments', () => {
    expect(compileRule('')).toBeUndefined();
    expect(compileRule('   ')).toBeUndefined();
    expect(compileRule('# a comment')).toBeUndefined();
  });

  it('treats an escaped hash as a literal pattern', () => {
    const rule = compileRule('\\#notacomment');
    expect(rule).toBeDefined();
    expect(rule?.regex.test('#notacomment')).toBe(true);
  });

  it('records negation and directory-only flags', () => {
    expect(compileRule('!keep.ts')?.negated).toBe(true);
    expect(compileRule('build/')?.directoryOnly).toBe(true);
    expect(compileRule('build')?.directoryOnly).toBe(false);
  });

  it('drops insignificant trailing whitespace', () => {
    expect(compileRule('foo.ts   ')?.regex.test('foo.ts')).toBe(true);
  });

  it('tolerates CRLF line endings in the ignore file', () => {
    // A .gitignore authored on Windows arrives with \r still attached.
    expect(compileRule('dist\r')?.regex.test('dist')).toBe(true);
  });
});

describe('matching', () => {
  it('matches an unanchored pattern at any depth', () => {
    const r = rules('secret.ts');
    expect(ignored(r, 'secret.ts')).toBe(true);
    expect(ignored(r, 'src/secret.ts')).toBe(true);
    expect(ignored(r, 'a/b/c/secret.ts')).toBe(true);
  });

  it('anchors a pattern containing a slash', () => {
    const r = rules('src/secret.ts');
    expect(ignored(r, 'src/secret.ts')).toBe(true);
    expect(ignored(r, 'lib/src/secret.ts')).toBe(false);
  });

  it('anchors a leading-slash pattern to the root', () => {
    const r = rules('/build');
    expect(ignored(r, 'build')).toBe(true);
    expect(ignored(r, 'packages/build')).toBe(false);
  });

  it('keeps * from crossing directory separators', () => {
    const r = rules('src/*.ts');
    expect(ignored(r, 'src/a.ts')).toBe(true);
    expect(ignored(r, 'src/nested/a.ts')).toBe(false);
  });

  it('lets **/ match any number of leading directories', () => {
    const r = rules('**/generated');
    expect(ignored(r, 'generated', true)).toBe(true);
    expect(ignored(r, 'a/generated', true)).toBe(true);
    expect(ignored(r, 'a/b/generated', true)).toBe(true);
  });

  it('lets a/**/b span intervening directories', () => {
    const r = rules('docs/**/draft.md');
    expect(ignored(r, 'docs/draft.md')).toBe(true);
    expect(ignored(r, 'docs/a/draft.md')).toBe(true);
    expect(ignored(r, 'docs/a/b/draft.md')).toBe(true);
    expect(ignored(r, 'other/a/draft.md')).toBe(false);
  });

  it('lets a trailing /** match everything beneath', () => {
    const r = rules('vendor/**');
    expect(ignored(r, 'vendor/a.php')).toBe(true);
    expect(ignored(r, 'vendor/a/b.php')).toBe(true);
    expect(ignored(r, 'vendors.php')).toBe(false);
  });

  it('applies directory-only rules only to directories', () => {
    const r = rules('build/');
    expect(ignored(r, 'build', true)).toBe(true);
    expect(ignored(r, 'build', false)).toBe(false);
  });

  it('honours character classes and negated classes', () => {
    expect(ignored(rules('file[0-9].ts'), 'file3.ts')).toBe(true);
    expect(ignored(rules('file[0-9].ts'), 'fileX.ts')).toBe(false);
    expect(ignored(rules('file[!0-9].ts'), 'fileX.ts')).toBe(true);
  });

  it('honours ? as exactly one non-separator character', () => {
    expect(ignored(rules('a?.ts'), 'ab.ts')).toBe(true);
    expect(ignored(rules('a?.ts'), 'abc.ts')).toBe(false);
    expect(ignored(rules('a?.ts'), 'a/.ts')).toBe(false);
  });

  it('lets the last matching rule win', () => {
    const r = rules('*.log', '!keep.log');
    expect(ignored(r, 'debug.log')).toBe(true);
    expect(ignored(r, 'keep.log')).toBe(false);
  });

  it('lets a later rule re-exclude what an earlier one re-included', () => {
    const r = rules('*.log', '!keep.log', 'keep.log');
    expect(ignored(r, 'keep.log')).toBe(true);
  });

  it('does not treat a literal dot as a wildcard', () => {
    expect(ignored(rules('a.ts'), 'axts')).toBe(false);
  });

  it('matches case-sensitively on every platform', () => {
    // Deliberate deviation from git on Windows/macOS: one repository must
    // produce one index regardless of the machine indexing it.
    expect(ignored(rules('Build/'), 'build', true)).toBe(false);
    expect(ignored(rules('Build/'), 'Build', true)).toBe(true);
  });
});

describe('nested ignore files', () => {
  it('scopes a nested file to its own directory', () => {
    const stack: IgnoreFile[] = [
      parseIgnoreFile('*.log', '', '.gitignore'),
      parseIgnoreFile('!important.log', 'packages/api', '.gitignore'),
    ];
    expect(ignored(stack, 'packages/api/important.log')).toBe(false);
    expect(ignored(stack, 'packages/web/important.log')).toBe(true);
  });

  it('does not apply a nested file to paths outside its directory', () => {
    const stack: IgnoreFile[] = [parseIgnoreFile('secret.ts', 'packages/api', '.gitignore')];
    expect(ignored(stack, 'packages/api/secret.ts')).toBe(true);
    expect(ignored(stack, 'packages/web/secret.ts')).toBe(false);
  });

  it('reports which rule and file decided, for the excluded-files list', () => {
    const stack = rules('*.log');
    const verdict = decide(stack, 'debug.log', false);
    expect(verdict.ignored).toBe(true);
    expect(verdict.rule?.source).toBe('*.log');
    expect(verdict.origin).toBe('.gitignore');
  });
});
