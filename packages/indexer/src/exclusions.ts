/**
 * Default exclusions applied on top of a repository's own ignore rules.
 *
 * DESIGN.md §6: "Exclude dependency folders, generated bundles, binaries,
 * caches, media, private keys, credential files, `.env` variants, and known
 * secret-bearing configurations by default. Include source, tests, schemas,
 * manifests, and documentation. Allow explicit dependency-source inclusion for
 * questions that require it. Show excluded files and reasons; never silently
 * describe an incomplete index as complete."
 *
 * Every rule carries a human-readable reason because the UI has to explain the
 * exclusion, not just apply it.
 */

import { basenamePosix } from './paths.js';

export type ExclusionCategory =
  | 'dependencies'
  | 'generated'
  | 'binary'
  | 'cache'
  | 'media'
  | 'secret-bearing'
  | 'vcs'
  | 'too-large'
  | 'not-text';

export type ExclusionReason = {
  readonly category: ExclusionCategory;
  /** One sentence, shown in the excluded-files list. */
  readonly message: string;
};

/** Directory names pruned during the walk, so their subtrees are never read. */
const EXCLUDED_DIRECTORIES = new Map<string, ExclusionReason>([
  ['node_modules', { category: 'dependencies', message: 'Installed dependency directory.' }],
  ['vendor', { category: 'dependencies', message: 'Installed dependency directory.' }],
  ['bower_components', { category: 'dependencies', message: 'Installed dependency directory.' }],
  ['.git', { category: 'vcs', message: 'Version control metadata.' }],
  ['.hg', { category: 'vcs', message: 'Version control metadata.' }],
  ['.svn', { category: 'vcs', message: 'Version control metadata.' }],
  ['dist', { category: 'generated', message: 'Build output directory.' }],
  ['build', { category: 'generated', message: 'Build output directory.' }],
  ['out', { category: 'generated', message: 'Build output directory.' }],
  ['.next', { category: 'generated', message: 'Framework build output.' }],
  ['.nuxt', { category: 'generated', message: 'Framework build output.' }],
  ['.turbo', { category: 'cache', message: 'Task runner cache.' }],
  ['.cache', { category: 'cache', message: 'Cache directory.' }],
  ['__pycache__', { category: 'cache', message: 'Python bytecode cache.' }],
  ['.pytest_cache', { category: 'cache', message: 'Test runner cache.' }],
  ['.gradle', { category: 'cache', message: 'Build tool cache.' }],
  ['coverage', { category: 'generated', message: 'Coverage report output.' }],
  ['.venv', { category: 'dependencies', message: 'Python virtual environment.' }],
  ['venv', { category: 'dependencies', message: 'Python virtual environment.' }],
]);

/** Extensions that are never useful as retrieval evidence. */
const EXCLUDED_EXTENSIONS = new Map<string, ExclusionReason>(
  (
    [
      [
        ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'tiff', 'ico', 'icns', 'svg'],
        'media',
        'Image file.',
      ],
      [
        ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'flac', 'ogg', 'm4a'],
        'media',
        'Audio or video file.',
      ],
      [['woff', 'woff2', 'ttf', 'otf', 'eot'], 'media', 'Font file.'],
      [['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar'], 'binary', 'Archive file.'],
      [
        ['exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'class', 'jar', 'wasm', 'node'],
        'binary',
        'Compiled binary.',
      ],
      [['pdf', 'docx', 'xlsx', 'pptx'], 'binary', 'Binary document format.'],
      [['sqlite', 'sqlite3', 'db', 'mdb'], 'binary', 'Database file.'],
      [['pyc', 'pyo'], 'generated', 'Compiled Python bytecode.'],
      [['lock'], 'generated', 'Dependency lockfile.'],
      [['map'], 'generated', 'Source map.'],
      [
        ['pem', 'key', 'p12', 'pfx', 'crt', 'cer', 'keystore', 'jks'],
        'secret-bearing',
        'Key or certificate file.',
      ],
    ] as const
  ).flatMap(([exts, category, message]) =>
    exts.map((ext) => [ext, { category, message }] as [string, ExclusionReason]),
  ),
);

/** Exact filenames that commonly carry credentials. */
const EXCLUDED_FILENAMES = new Map<string, ExclusionReason>([
  ['.npmrc', { category: 'secret-bearing', message: 'May contain registry auth tokens.' }],
  ['.netrc', { category: 'secret-bearing', message: 'Stores machine credentials.' }],
  ['.pgpass', { category: 'secret-bearing', message: 'Stores database passwords.' }],
  ['id_rsa', { category: 'secret-bearing', message: 'Private SSH key.' }],
  ['id_ed25519', { category: 'secret-bearing', message: 'Private SSH key.' }],
  ['credentials', { category: 'secret-bearing', message: 'Credential file.' }],
  ['.htpasswd', { category: 'secret-bearing', message: 'Password file.' }],
]);

/**
 * `.env` and its variants, but not `.env.example` / `.env.sample` /
 * `.env.template`, which are the committed contract and are useful evidence.
 */
function envFileReason(name: string): ExclusionReason | undefined {
  if (name !== '.env' && !name.startsWith('.env.')) return undefined;
  const suffix = name.slice(5);
  if (suffix === 'example' || suffix === 'sample' || suffix === 'template' || suffix === 'dist') {
    return undefined;
  }
  return { category: 'secret-bearing', message: 'Environment file; may contain live secrets.' };
}

/** Minified or bundled output recognised by name rather than extension. */
function generatedNameReason(name: string): ExclusionReason | undefined {
  if (/\.min\.(js|css)$/.test(name)) {
    return { category: 'generated', message: 'Minified bundle.' };
  }
  if (/^(package-lock|pnpm-lock|yarn\.lock|composer\.lock|poetry\.lock|Gemfile\.lock)/.test(name)) {
    return { category: 'generated', message: 'Dependency lockfile.' };
  }
  return undefined;
}

export function directoryExclusion(name: string): ExclusionReason | undefined {
  return EXCLUDED_DIRECTORIES.get(name);
}

/** Decide whether a file is excluded by the built-in defaults. */
export function fileExclusion(relativePosix: string): ExclusionReason | undefined {
  const name = basenamePosix(relativePosix);

  const env = envFileReason(name);
  if (env) return env;

  const byName = EXCLUDED_FILENAMES.get(name);
  if (byName) return byName;

  const generated = generatedNameReason(name);
  if (generated) return generated;

  const dot = name.lastIndexOf('.');
  if (dot > 0) {
    const ext = name.slice(dot + 1).toLowerCase();
    const byExt = EXCLUDED_EXTENSIONS.get(ext);
    if (byExt) return byExt;
  }

  return undefined;
}

/**
 * Detect binary content so a file with an unknown extension is not indexed as
 * if it were source. A NUL byte in the first 8 KiB is the same heuristic git
 * uses, and it is cheap.
 */
export function looksBinary(sample: Uint8Array): boolean {
  const limit = Math.min(sample.length, 8192);
  for (let i = 0; i < limit; i += 1) {
    if (sample[i] === 0) return true;
  }
  return false;
}
