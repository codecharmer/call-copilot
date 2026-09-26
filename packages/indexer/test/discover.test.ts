/**
 * End-to-end discovery against a real temporary directory.
 *
 * These are the tests that would catch a Windows path bug, so they use the real
 * filesystem rather than a mock. They run identically on both platforms.
 */

import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectLanguage, discover, readTextFile } from '../src/discover.js';
import { resolveRoot, toRelativePosix, isInsideRoot } from '../src/paths.js';

let dir: string;

async function write(relative: string, contents: string): Promise<void> {
  const full = join(dir, ...relative.split('/'));
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, contents, 'utf8');
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'callcopilot-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('path boundary', () => {
  it('treats the root itself as inside', () => {
    const root = resolveRoot(dir);
    expect(isInsideRoot(root, root.absolute)).toBe(true);
  });

  it('rejects a sibling directory with a shared name prefix', () => {
    // A naive startsWith check would accept '/repo-backup' as inside '/repo'.
    const root = resolveRoot(dir);
    expect(isInsideRoot(root, `${root.absolute}-backup`)).toBe(false);
  });

  it('rejects a parent directory', () => {
    const root = resolveRoot(dir);
    expect(isInsideRoot(root, join(root.absolute, '..'))).toBe(false);
  });

  it('returns POSIX-shaped relative paths on every platform', async () => {
    await write('src/deep/file.ts', 'export const a = 1;');
    const root = resolveRoot(dir);
    const rel = toRelativePosix(root, join(root.absolute, 'src', 'deep', 'file.ts'));
    expect(rel).toBe('src/deep/file.ts');
    expect(rel).not.toContain('\\');
  });

  it('refuses to relativise a path outside the root', () => {
    const root = resolveRoot(dir);
    expect(toRelativePosix(root, join(root.absolute, '..', 'elsewhere.ts'))).toBeUndefined();
  });
});

describe('detectLanguage', () => {
  it('recognises the structured-parsing languages', () => {
    expect(detectLanguage('a.ts')).toBe('typescript');
    expect(detectLanguage('a.tsx')).toBe('typescript');
    expect(detectLanguage('a.js')).toBe('javascript');
    expect(detectLanguage('a.php')).toBe('php');
    expect(detectLanguage('a.py')).toBe('python');
  });

  it('recognises extensionless files worth indexing', () => {
    expect(detectLanguage('Dockerfile')).toBe('dockerfile');
    expect(detectLanguage('Makefile')).toBe('makefile');
  });

  it('returns undefined for an unknown type', () => {
    expect(detectLanguage('mystery.qqq')).toBeUndefined();
    expect(detectLanguage('LICENSE')).toBeUndefined();
  });
});

describe('discover', () => {
  it('finds source files and reports their language', async () => {
    await write('src/index.ts', 'export const a = 1;');
    await write('src/app.php', '<?php echo 1;');
    await write('README.md', '# Title');

    const { files } = await discover(resolveRoot(dir));
    const paths = files.map((f) => f.relativePath);

    expect(paths).toEqual(['README.md', 'src/app.php', 'src/index.ts']);
    expect(files.find((f) => f.relativePath === 'src/app.php')?.language).toBe('php');
  });

  it('prunes dependency and build directories without walking them', async () => {
    await write('node_modules/left-pad/index.js', 'module.exports = 1;');
    await write('dist/bundle.js', 'var a=1;');
    await write('src/real.ts', 'export const a = 1;');

    const { files, skipped } = await discover(resolveRoot(dir));

    expect(files.map((f) => f.relativePath)).toEqual(['src/real.ts']);
    // The subtree is never enumerated, so only the directory itself is listed.
    expect(skipped.map((s) => s.relativePath)).toContain('node_modules');
    expect(skipped.some((s) => s.relativePath.includes('left-pad'))).toBe(false);
  });

  it('honours a root .gitignore', async () => {
    await write('.gitignore', 'ignored.ts\n');
    await write('ignored.ts', 'export const a = 1;');
    await write('kept.ts', 'export const b = 2;');

    const { files, skipped } = await discover(resolveRoot(dir));

    expect(files.map((f) => f.relativePath)).toEqual(['kept.ts']);
    const entry = skipped.find((s) => s.relativePath === 'ignored.ts');
    expect(entry?.origin).toBe('.gitignore');
    expect(entry?.reason).toContain('ignored.ts');
  });

  it('honours a nested .gitignore that re-includes a file', async () => {
    await write('.gitignore', '*.gen.ts\n');
    await write('packages/api/.gitignore', '!keep.gen.ts\n');
    await write('packages/api/keep.gen.ts', 'export const kept = 1;');
    await write('packages/web/drop.gen.ts', 'export const dropped = 1;');
    await write('packages/api/a.ts', 'export const a = 1;');

    const { files } = await discover(resolveRoot(dir));
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain('packages/api/keep.gen.ts');
    expect(paths).not.toContain('packages/web/drop.gen.ts');
  });

  it('does not index the ignore files themselves', async () => {
    // They describe what the index contains, not how the software works.
    await write('.gitignore', 'nothing\n');
    await write('.callcopilotignore', 'nothing\n');
    await write('src/a.ts', 'export const a = 1;');

    const { files } = await discover(resolveRoot(dir));
    expect(files.map((f) => f.relativePath)).toEqual(['src/a.ts']);
  });

  it('honours .callcopilotignore alongside .gitignore', async () => {
    await write('.callcopilotignore', 'fixtures/\n');
    await write('fixtures/big.json', '{}');
    await write('src/a.ts', 'export const a = 1;');

    const { files, skipped } = await discover(resolveRoot(dir));

    expect(files.map((f) => f.relativePath)).toEqual(['src/a.ts']);
    expect(skipped.find((s) => s.relativePath === 'fixtures')?.origin).toBe('.callcopilotignore');
  });

  it('excludes .env but keeps .env.example', async () => {
    await write('.env', 'SECRET=live');
    await write('.env.production', 'SECRET=live');
    await write('.env.example', 'SECRET=');

    const { files, skipped } = await discover(resolveRoot(dir));
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain('.env.example');
    expect(paths).not.toContain('.env');
    expect(paths).not.toContain('.env.production');
    expect(skipped.find((s) => s.relativePath === '.env')?.reason).toContain('secrets');
  });

  it('excludes key and certificate files', async () => {
    await write('certs/server.pem', 'x');
    await write('certs/server.key', 'x');
    await write('src/a.ts', 'export const a = 1;');

    const { files } = await discover(resolveRoot(dir));
    expect(files.map((f) => f.relativePath)).toEqual(['src/a.ts']);
  });

  it('excludes media, archives and minified bundles', async () => {
    await write('assets/logo.png', 'x');
    await write('assets/demo.mp4', 'x');
    await write('assets/lib.min.js', 'x');
    await write('release.zip', 'x');
    await write('src/a.ts', 'export const a = 1;');

    const { files } = await discover(resolveRoot(dir));
    expect(files.map((f) => f.relativePath)).toEqual(['src/a.ts']);
  });

  it('gives every skipped file a reason and an origin', async () => {
    // §6: "Show excluded files and reasons; never silently describe an
    // incomplete index as complete."
    await write('.gitignore', 'secret.ts\n');
    await write('secret.ts', 'x');
    await write('logo.png', 'x');
    await write('node_modules/a/i.js', 'x');

    const { skipped } = await discover(resolveRoot(dir));
    expect(skipped.length).toBeGreaterThan(0);
    for (const entry of skipped) {
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.origin.length).toBeGreaterThan(0);
    }
  });

  it('does not follow symlinks', async () => {
    // A symlink can point outside the canonical root, breaking the boundary.
    const outside = await mkdtemp(join(tmpdir(), 'callcopilot-outside-'));
    await writeFile(join(outside, 'secret.ts'), 'export const leaked = 1;', 'utf8');
    await write('src/a.ts', 'export const a = 1;');
    await symlink(outside, join(dir, 'linked'), 'dir');

    const { files, skipped } = await discover(resolveRoot(dir));

    expect(files.map((f) => f.relativePath)).toEqual(['src/a.ts']);
    expect(skipped.find((s) => s.relativePath === 'linked')?.reason).toContain('Symbolic link');

    await rm(outside, { recursive: true, force: true });
  });

  it('skips files larger than the configured limit', async () => {
    await write('huge.ts', 'x'.repeat(2000));
    await write('small.ts', 'export const a = 1;');

    const { files, skipped } = await discover(resolveRoot(dir), {
      maxFileBytes: 1000,
      maxFiles: 100,
      ignoreFileNames: ['.gitignore'],
    });

    expect(files.map((f) => f.relativePath)).toEqual(['small.ts']);
    expect(skipped.find((s) => s.relativePath === 'huge.ts')?.origin).toBe('size');
  });

  it('returns a deterministic order', async () => {
    await write('z.ts', 'x');
    await write('a.ts', 'x');
    await write('m/b.ts', 'x');

    const first = await discover(resolveRoot(dir));
    const second = await discover(resolveRoot(dir));
    expect(second.files.map((f) => f.relativePath)).toEqual(first.files.map((f) => f.relativePath));
    expect(first.files.map((f) => f.relativePath)).toEqual(['a.ts', 'm/b.ts', 'z.ts']);
  });
});

describe('readTextFile', () => {
  it('reads a text file', async () => {
    await write('a.ts', 'export const a = 1;');
    const { files } = await discover(resolveRoot(dir));
    expect(await readTextFile(files[0]!)).toBe('export const a = 1;');
  });

  it('refuses a file whose extension lied about being text', async () => {
    await writeFile(join(dir, 'fake.ts'), Buffer.from([0x00, 0x01, 0x02, 0x00]));
    const { files } = await discover(resolveRoot(dir));
    expect(await readTextFile(files[0]!)).toBeUndefined();
  });
});

describe('explicit dependency-source inclusion', () => {
  it('lets an explicit negation re-include an excluded dependency directory', async () => {
    // §6: "Allow explicit dependency-source inclusion for questions that
    // require it." A WordPress or Composer project keeps framework source in
    // vendor/, and "what does the framework do here?" needs it.
    await write('.callcopilotignore', '!vendor/\n');
    await write('vendor/acme/payments/src/Gateway.php', '<?php class Gateway {}');
    await write('src/a.ts', 'export const a = 1;');

    const { files } = await discover(resolveRoot(dir));
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain('vendor/acme/payments/src/Gateway.php');
    expect(paths).toContain('src/a.ts');
  });

  it('still excludes a dependency directory when nothing re-includes it', async () => {
    await write('vendor/acme/src/Gateway.php', '<?php class Gateway {}');
    await write('src/a.ts', 'export const a = 1;');

    const { files, skipped } = await discover(resolveRoot(dir));

    expect(files.map((f) => f.relativePath)).toEqual(['src/a.ts']);
    expect(skipped.find((s) => s.relativePath === 'vendor')?.origin).toBe('default');
  });

  it('never lets a negation re-include a secret-bearing file', async () => {
    // A broad `!*` must not be able to put a live .env or a private key into
    // an evidence pack that gets sent to a cloud model.
    await write('.callcopilotignore', '!*\n');
    await write('.env', 'SECRET=live');
    await write('certs/server.key', 'x');
    await write('src/a.ts', 'export const a = 1;');

    const { files } = await discover(resolveRoot(dir));
    const paths = files.map((f) => f.relativePath);

    expect(paths).not.toContain('.env');
    expect(paths).not.toContain('certs/server.key');
  });
});

describe('nested repositories and tool metadata', () => {
  it('prunes a child directory that carries its own .git', async () => {
    // A linked worktree or nested clone is a different repository. Indexing
    // it here would attribute its code to this one and, for worktrees, index
    // the same files several times over.
    await write('.git/HEAD', 'ref: refs/heads/main');
    await write('src/a.ts', 'export const a = 1;');
    await write('.claude/worktrees/feature/.git', 'gitdir: ../../../.git/worktrees/feature');
    await write('.claude/worktrees/feature/src/a.ts', 'export const a = 1;');
    await write('nested-clone/.git/HEAD', 'ref: refs/heads/main');
    await write('nested-clone/lib.ts', 'export const b = 2;');

    const { files, skipped } = await discover(resolveRoot(dir));

    expect(files.map((f) => f.relativePath)).toEqual(['src/a.ts']);
    expect(skipped.find((s) => s.relativePath === 'nested-clone')?.reason).toContain(
      'Nested repository',
    );
  });

  it('does not prune the root even though it has a .git', async () => {
    await write('.git/HEAD', 'ref: refs/heads/main');
    await write('a.ts', 'export const a = 1;');
    const { files } = await discover(resolveRoot(dir));
    expect(files.map((f) => f.relativePath)).toEqual(['a.ts']);
  });

  it('excludes editor and agent tool metadata directories', async () => {
    await write('.claude/settings.local.json', '{}');
    await write('.idea/workspace.xml', '<x/>');
    await write('src/a.ts', 'export const a = 1;');
    const { files } = await discover(resolveRoot(dir));
    expect(files.map((f) => f.relativePath)).toEqual(['src/a.ts']);
  });
});

describe('truncation', () => {
  const opts = { maxFileBytes: 1_000_000, maxFiles: 3, ignoreFileNames: ['.gitignore'] };

  it('reports when the walk stopped at the file limit', async () => {
    // §6: "never silently describe an incomplete index as complete."
    for (let i = 0; i < 5; i += 1) await write(`f${i}.ts`, 'export const x = 1;');
    const result = await discover(resolveRoot(dir), opts);
    expect(result.files.length).toBe(3);
    expect(result.truncated).toBeDefined();
    expect(result.truncated?.limit).toBe(3);
    expect(result.truncated?.message).toContain('incomplete');
  });

  it('does not report truncation when the repository fits', async () => {
    for (let i = 0; i < 2; i += 1) await write(`f${i}.ts`, 'export const x = 1;');
    const result = await discover(resolveRoot(dir), opts);
    expect(result.truncated).toBeUndefined();
  });
});
