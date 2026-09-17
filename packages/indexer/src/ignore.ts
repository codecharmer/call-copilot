/**
 * Gitignore-compatible pattern matching.
 *
 * DESIGN.md §6 requires honouring "nested Git ignore rules and a
 * project-specific `.callcopilotignore` file". Both use gitignore syntax, so
 * one implementation serves both.
 *
 * This is written from the gitignore specification rather than pulled from a
 * dependency because the rules are small, the behaviour must be identical on
 * Windows and macOS, and a wrong answer here silently changes what gets
 * indexed — which is exactly the class of bug the design refuses to allow
 * ("never silently describe an incomplete index as complete").
 *
 * Deliberate deviation from git: matching is **case-sensitive on every
 * platform**. Git defaults to case-insensitive matching on Windows and macOS,
 * which would make the same repository produce different indexes on different
 * machines. Determinism wins.
 */

/** One compiled pattern line from an ignore file. */
export type IgnoreRule = {
  /** The source line, kept for explaining exclusions to the user. */
  readonly source: string;
  /** `!` prefix: re-includes a path an earlier rule excluded. */
  readonly negated: boolean;
  /** Trailing `/`: matches directories only. */
  readonly directoryOnly: boolean;
  readonly regex: RegExp;
};

/** A set of rules together with the directory its patterns are relative to. */
export type IgnoreFile = {
  /** POSIX path of the directory containing the ignore file, '' at the root. */
  readonly baseDir: string;
  /** Where the rules came from, e.g. '.gitignore' or '.callcopilotignore'. */
  readonly origin: string;
  readonly rules: IgnoreRule[];
};

const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g;

function escapeLiteral(text: string): string {
  return text.replace(REGEX_SPECIAL, '\\$&');
}

/**
 * Strip trailing whitespace that git treats as insignificant.
 *
 * Git keeps trailing spaces only when the last one is backslash-escaped.
 */
function stripTrailingSpaces(line: string): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) {
    // A backslash before the run of spaces makes the final space significant.
    let backslashes = 0;
    let i = end - 2;
    while (i >= 0 && line[i] === '\\') {
      backslashes += 1;
      i -= 1;
    }
    if (backslashes % 2 === 1) break;
    end -= 1;
  }
  return line.slice(0, end);
}

/**
 * Translate a gitignore glob into a regular expression source fragment.
 *
 * Handles `*` (not crossing `/`), `?` (one char, not `/`), `**` (crossing
 * `/`), character classes, and backslash escapes.
 */
function globToRegexSource(glob: string): string {
  let out = '';
  let i = 0;

  while (i < glob.length) {
    const ch = glob[i] as string;

    if (ch === '\\') {
      const next = glob[i + 1];
      if (next === undefined) {
        out += '\\\\';
        i += 1;
      } else {
        out += escapeLiteral(next);
        i += 2;
      }
      continue;
    }

    if (ch === '*') {
      const isDouble = glob[i + 1] === '*';
      if (isDouble) {
        const before = i === 0 ? '/' : glob[i - 1];
        const after = glob[i + 2];
        // A `**` bounded by slashes (or string edges) may span directories.
        const boundedLeft = before === '/';
        const boundedRight = after === '/' || after === undefined;

        if (boundedLeft && boundedRight && after === '/') {
          // `a/**/b` — zero or more intervening directories.
          out += '(?:.*/)?';
          i += 3; // consume '**' and the following '/'
          continue;
        }
        if (boundedLeft && boundedRight) {
          // Trailing `**` — everything beneath.
          out += '.*';
          i += 2;
          continue;
        }
        // `a**b` behaves like a single `*` per gitignore's "other consecutive
        // asterisks are considered regular asterisks" rule.
        out += '[^/]*';
        i += 2;
        continue;
      }
      out += '[^/]*';
      i += 1;
      continue;
    }

    if (ch === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }

    if (ch === '[') {
      const close = findClassEnd(glob, i);
      if (close === -1) {
        out += '\\[';
        i += 1;
        continue;
      }
      let body = glob.slice(i + 1, close);
      // gitignore uses `!` for negation; regex uses `^`.
      if (body.startsWith('!')) body = `^${body.slice(1)}`;
      out += `[${body}]`;
      i = close + 1;
      continue;
    }

    if (ch === '/') {
      out += '/';
      i += 1;
      continue;
    }

    out += escapeLiteral(ch);
    i += 1;
  }

  return out;
}

/** Find the `]` closing a character class, accounting for `]` as a first char. */
function findClassEnd(glob: string, openIndex: number): number {
  let i = openIndex + 1;
  if (glob[i] === '!') i += 1;
  if (glob[i] === ']') i += 1; // a literal ']' may lead the class
  while (i < glob.length) {
    if (glob[i] === '\\') {
      i += 2;
      continue;
    }
    if (glob[i] === ']') return i;
    i += 1;
  }
  return -1;
}

/**
 * Compile a single ignore-file line.
 *
 * Returns `undefined` for blank lines and comments.
 */
export function compileRule(rawLine: string): IgnoreRule | undefined {
  const source = rawLine;
  let line = stripTrailingSpaces(rawLine.replace(/\r$/, ''));

  if (line.length === 0) return undefined;
  if (line.startsWith('#')) return undefined;

  let negated = false;
  if (line.startsWith('!')) {
    negated = true;
    line = line.slice(1);
  } else if (line.startsWith('\\#') || line.startsWith('\\!')) {
    line = line.slice(1);
  }

  if (line.length === 0) return undefined;

  let directoryOnly = false;
  if (line.endsWith('/')) {
    directoryOnly = true;
    line = line.slice(0, -1);
  }

  if (line.length === 0) return undefined;

  // A leading slash anchors to the ignore file's directory and is not part of
  // the pattern. A slash anywhere else also anchors, but stays significant.
  let anchored = false;
  if (line.startsWith('/')) {
    anchored = true;
    line = line.slice(1);
  } else if (line.includes('/')) {
    // `**/foo` is the explicit spelling of "unanchored", not an anchor.
    anchored = !line.startsWith('**/');
  }

  const body = globToRegexSource(line);
  // An unanchored pattern matches at any depth: allow any leading directories.
  const prefix = anchored ? '' : '(?:.*/)?';
  const regex = new RegExp(`^${prefix}${body}$`);

  return { source, negated, directoryOnly, regex };
}

/** Parse a whole ignore file's contents. */
export function parseIgnoreFile(contents: string, baseDir: string, origin: string): IgnoreFile {
  const rules: IgnoreRule[] = [];
  for (const line of contents.split('\n')) {
    const rule = compileRule(line);
    if (rule) rules.push(rule);
  }
  return { baseDir, origin, rules };
}

export type IgnoreDecision = {
  readonly ignored: boolean;
  /** The rule that decided, for showing the user why a file was excluded. */
  readonly rule?: IgnoreRule;
  readonly origin?: string;
  /**
   * True when a `!` rule matched last, i.e. the user asked for this path
   * specifically rather than it merely failing to match anything.
   *
   * DESIGN.md §6 requires allowing "explicit dependency-source inclusion for
   * questions that require it", so this is what lets `!vendor/` override the
   * built-in dependency-directory exclusion. Silence is not consent: a path
   * that simply matched no rule does not get that power.
   */
  readonly explicitlyIncluded: boolean;
};

/**
 * Decide whether a path is ignored by a stack of ignore files.
 *
 * `files` must be ordered outermost-first, matching git's precedence: a rule in
 * a deeper directory overrides a shallower one, and within one file the **last**
 * matching rule wins.
 *
 * @param relativePosix Path relative to the repository root.
 * @param isDirectory   Directory-only rules apply only when this is true.
 */
export function decide(
  files: readonly IgnoreFile[],
  relativePosix: string,
  isDirectory: boolean,
): IgnoreDecision {
  let decision: IgnoreDecision = { ignored: false, explicitlyIncluded: false };

  for (const file of files) {
    const scoped = scopeToBase(file.baseDir, relativePosix);
    if (scoped === undefined) continue;

    for (const rule of file.rules) {
      if (rule.directoryOnly && !isDirectory) continue;
      if (!rule.regex.test(scoped)) continue;
      decision = {
        ignored: !rule.negated,
        rule,
        origin: file.origin,
        explicitlyIncluded: rule.negated,
      };
    }
  }

  return decision;
}

/**
 * Re-express a root-relative path relative to an ignore file's directory.
 *
 * Returns `undefined` when the path is not under that directory, in which case
 * the file's rules do not apply at all.
 */
function scopeToBase(baseDir: string, relativePosix: string): string | undefined {
  if (baseDir === '') return relativePosix;
  const prefix = `${baseDir}/`;
  if (!relativePosix.startsWith(prefix)) return undefined;
  return relativePosix.slice(prefix.length);
}
