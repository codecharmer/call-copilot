/**
 * Identifier splitting for lexical search.
 *
 * DESIGN.md §6: "Store original identifiers alongside split forms, so
 * `processWebhook`, `process_webhook`, and spoken 'process webhook' can be
 * found without losing exact-match signals."
 *
 * This is not a theoretical requirement. SQLite's FTS5 default tokenizer splits
 * only on non-alphanumeric characters, so `processWebhook` becomes the single
 * token `processwebhook`. Verified against Node 22's bundled SQLite:
 *
 *     create virtual table b using fts5(body);
 *     insert into b values('function processWebhook(req)');
 *     select 1 from b where b match 'webhook';   -- 0 rows
 *     select 1 from b where b match 'process';   -- 0 rows
 *
 * Someone asking out loud "how does process webhook work" would therefore match
 * nothing at all. Indexing the split form in a second column fixes that while
 * the original column keeps exact-match ranking intact.
 */

/**
 * Split an identifier into its component words.
 *
 * Handles camelCase, PascalCase, snake_case, kebab-case, SCREAMING_SNAKE, and
 * the acronym boundary in `HTTPServer` → `HTTP Server`. Digits are kept with
 * the word they trail (`utf8Decode` → `utf8 decode`) because splitting them off
 * produces noise tokens like `8`.
 */
export function splitIdentifier(identifier: string): string[] {
  if (identifier.length === 0) return [];

  const words: string[] = [];
  let current = '';

  const push = (): void => {
    if (current.length > 0) {
      words.push(current);
      current = '';
    }
  };

  for (let i = 0; i < identifier.length; i += 1) {
    const ch = identifier[i] as string;

    if (ch === '_' || ch === '-' || ch === '.' || ch === '/' || ch === ' ') {
      push();
      continue;
    }

    const prev = identifier[i - 1];
    const next = identifier[i + 1];

    const isUpper = ch >= 'A' && ch <= 'Z';
    const prevIsLowerOrDigit =
      prev !== undefined && ((prev >= 'a' && prev <= 'z') || (prev >= '0' && prev <= '9'));
    const nextIsLower = next !== undefined && next >= 'a' && next <= 'z';
    const prevIsUpper = prev !== undefined && prev >= 'A' && prev <= 'Z';

    // `processWebhook` → split before W. `HTTPServer` → split before S.
    if (isUpper && (prevIsLowerOrDigit || (prevIsUpper && nextIsLower))) {
      push();
    }

    current += ch;
  }

  push();
  return words.filter((w) => w.length > 0);
}

/**
 * Build the searchable split form of a body of text.
 *
 * Every identifier-shaped run contributes its component words. The result is
 * stored in a separate FTS5 column; the original text keeps its own column so
 * an exact search for `processWebhook` still outranks a fuzzy one.
 */
export function buildSplitForm(text: string): string {
  const out = new Set<string>();

  for (const token of text.match(/[A-Za-z_$][A-Za-z0-9_$]*|[A-Za-z][A-Za-z0-9-]*/g) ?? []) {
    const parts = splitIdentifier(token);
    if (parts.length <= 1) continue;
    for (const part of parts) out.add(part.toLowerCase());
  }

  return [...out].join(' ');
}

/**
 * Normalise a spoken or typed query into terms worth sending to lexical search.
 *
 * Someone says "how does process webhook handle retries"; the useful terms are
 * the content words. Stop words are dropped because FTS5 has no notion of them
 * and they would match nearly every chunk.
 *
 * **Search terms only — never question classification.** This drops exactly the
 * interrogatives ("how", "what", "where") that §7's question detector relies on
 * as its signal. The detector must read the original utterance, not this.
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'do',
  'does',
  'did',
  'doing',
  'have',
  'has',
  'had',
  'can',
  'could',
  'will',
  'would',
  'should',
  'what',
  'where',
  'when',
  'why',
  'how',
  'who',
  'which',
  'this',
  'that',
  'these',
  'those',
  'i',
  'we',
  'you',
  'it',
  'and',
  'or',
  'but',
  'if',
  'then',
  'else',
  'for',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'with',
  'from',
  'about',
  'into',
  'our',
  'me',
  'my',
]);

export function queryTerms(question: string): string[] {
  const terms = new Set<string>();

  for (const token of question.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
    const lower = token.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    if (lower.length < 2) continue;
    terms.add(lower);
    // An identifier spoken as one word should also match its split parts.
    for (const part of splitIdentifier(token)) {
      const p = part.toLowerCase();
      if (p.length >= 2 && !STOP_WORDS.has(p)) terms.add(p);
    }
  }

  return [...terms];
}
