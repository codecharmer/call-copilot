import { describe, expect, it } from 'vitest';

import {
  chunkId,
  diffManifests,
  generationId,
  hashBytes,
  hashText,
  type Manifest,
  type ManifestEntry,
} from '../src/manifest.js';

const VERSIONS: Manifest['versions'] = { chunker: '1', parser: '1', embedding: 'minilm@1' };

function entry(relativePath: string, contentHash: string): ManifestEntry {
  return { relativePath, contentHash, sizeBytes: 10, language: 'typescript', chunkIds: [] };
}

function manifest(files: ManifestEntry[], versions = VERSIONS): Manifest {
  return {
    generationId: generationId('repo-1', files, versions),
    repositoryId: 'repo-1',
    createdAtMs: 0,
    files,
    excluded: [],
    versions,
  };
}

describe('hashing', () => {
  it('produces a stable hex digest', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('distinguishes a CRLF file from its LF twin', () => {
    // They are genuinely different bytes on disk, and a citation must not
    // silently reuse chunks across the two.
    expect(hashText('a\r\nb')).not.toBe(hashText('a\nb'));
  });

  it('hashes raw bytes', () => {
    expect(hashBytes(new TextEncoder().encode('abc'))).toBe(hashText('abc'));
  });
});

describe('chunkId', () => {
  it('is deterministic for the same file, content and line range', () => {
    const a = chunkId('src/a.ts', 'hash1', 1, 20);
    const b = chunkId('src/a.ts', 'hash1', 1, 20);
    expect(a).toBe(b);
  });

  it('changes when the content changes', () => {
    expect(chunkId('src/a.ts', 'hash1', 1, 20)).not.toBe(chunkId('src/a.ts', 'hash2', 1, 20));
  });

  it('changes when the line range changes', () => {
    expect(chunkId('src/a.ts', 'hash1', 1, 20)).not.toBe(chunkId('src/a.ts', 'hash1', 1, 21));
  });

  it('changes when the file moves', () => {
    expect(chunkId('src/a.ts', 'hash1', 1, 20)).not.toBe(chunkId('src/b.ts', 'hash1', 1, 20));
  });
});

describe('generationId', () => {
  it('is stable across runs over identical content', () => {
    const files = [entry('a.ts', 'h1'), entry('b.ts', 'h2')];
    expect(generationId('repo-1', files, VERSIONS)).toBe(generationId('repo-1', files, VERSIONS));
  });

  it('ignores filesystem enumeration order', () => {
    const forward = [entry('a.ts', 'h1'), entry('b.ts', 'h2')];
    const reversed = [entry('b.ts', 'h2'), entry('a.ts', 'h1')];
    expect(generationId('repo-1', reversed, VERSIONS)).toBe(
      generationId('repo-1', forward, VERSIONS),
    );
  });

  it('changes when a file changes', () => {
    const before = [entry('a.ts', 'h1')];
    const after = [entry('a.ts', 'h2')];
    expect(generationId('repo-1', after, VERSIONS)).not.toBe(
      generationId('repo-1', before, VERSIONS),
    );
  });

  it('changes when the embedding model changes', () => {
    // §6: a changed generation invalidates answer reuse. A new embedding model
    // must therefore produce a new generation even over identical files.
    const files = [entry('a.ts', 'h1')];
    const other = { ...VERSIONS, embedding: 'minilm@2' };
    expect(generationId('repo-1', files, other)).not.toBe(generationId('repo-1', files, VERSIONS));
  });

  it('differs between repositories with identical content', () => {
    const files = [entry('a.ts', 'h1')];
    expect(generationId('repo-2', files, VERSIONS)).not.toBe(
      generationId('repo-1', files, VERSIONS),
    );
  });
});

describe('diffManifests', () => {
  it('classifies added, modified, removed and unchanged files', () => {
    const before = manifest([
      entry('keep.ts', 'h1'),
      entry('edit.ts', 'h2'),
      entry('gone.ts', 'h3'),
    ]);
    const after = manifest([
      entry('keep.ts', 'h1'),
      entry('edit.ts', 'h2-changed'),
      entry('new.ts', 'h4'),
    ]);

    const diff = diffManifests(before, after);

    expect(diff.unchanged).toEqual(['keep.ts']);
    expect(diff.modified).toEqual(['edit.ts']);
    expect(diff.added).toEqual(['new.ts']);
    expect(diff.removed).toEqual(['gone.ts']);
  });

  it('treats a first index as all-added', () => {
    const diff = diffManifests(undefined, manifest([entry('a.ts', 'h1')]));
    expect(diff.added).toEqual(['a.ts']);
    expect(diff.removed).toEqual([]);
  });

  it('reports nothing to do when nothing changed', () => {
    const files = [entry('a.ts', 'h1'), entry('b.ts', 'h2')];
    const diff = diffManifests(manifest(files), manifest(files));
    expect(diff.added).toEqual([]);
    expect(diff.modified).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.unchanged.length).toBe(2);
  });
});
