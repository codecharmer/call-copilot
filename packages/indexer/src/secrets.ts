/**
 * Content-based secret redaction.
 *
 * DESIGN.md §6: "Apply a content-based secret filter before storing or sending
 * chunks. Pattern filtering reduces exposure but cannot guarantee detection of
 * every secret. Preserve line numbering when redacting."
 *
 * Two properties this module must hold:
 *
 * - **Line count never changes.** A redaction that swallowed a newline would
 *   shift every line number after it, and citations would point at the wrong
 *   code. Every replacement is newline-free by construction.
 * - **Redaction happens before storage and before any network send**, so a
 *   secret never reaches the index, an evidence pack, or a provider.
 *
 * This is a reduction in exposure, not a guarantee. The UI must not describe a
 * redacted file as "safe"; it is "filtered".
 */

export type SecretFinding = {
  /** 1-based line number in the original text. */
  readonly line: number;
  /** Which rule matched, e.g. 'aws-access-key-id'. */
  readonly rule: string;
};

export type RedactionResult = {
  readonly text: string;
  readonly findings: SecretFinding[];
};

type SecretRule = {
  readonly name: string;
  readonly pattern: RegExp;
  /**
   * Which capture group holds the secret itself. Group 0 redacts the whole
   * match; a higher group keeps surrounding context like `api_key =` visible
   * so the code still reads sensibly.
   */
  readonly group: number;
};

/**
 * Patterns are intentionally conservative: a missed secret is a privacy risk,
 * but an over-eager rule that redacts ordinary code makes answers wrong. Each
 * rule targets a shape that does not occur by accident.
 */
const RULES: readonly SecretRule[] = [
  { name: 'aws-access-key-id', pattern: /\b((?:AKIA|ASIA|AGPA|AIDA)[0-9A-Z]{16})\b/g, group: 1 },
  { name: 'github-token', pattern: /\b(gh[pousr]_[A-Za-z0-9]{36,255})\b/g, group: 1 },
  { name: 'slack-token', pattern: /\b(xox[abposr]-[A-Za-z0-9-]{10,})\b/g, group: 1 },
  { name: 'stripe-key', pattern: /\b((?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,})\b/g, group: 1 },
  { name: 'openai-key', pattern: /\b(sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/g, group: 1 },
  { name: 'anthropic-key', pattern: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g, group: 1 },
  { name: 'google-api-key', pattern: /\b(AIza[0-9A-Za-z_-]{35})\b/g, group: 1 },
  { name: 'private-key-block', pattern: /(-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----)/g, group: 1 },
  {
    name: 'jwt',
    pattern: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
    group: 1,
  },
  // Assignment shapes: keep the key name, redact the literal value only.
  {
    name: 'assigned-secret',
    pattern:
      /\b((?:api[_-]?key|secret|password|passwd|token|access[_-]?key|private[_-]?key|client[_-]?secret)\s*[:=]\s*)(['"])([^'"\n]{8,})\2/gi,
    group: 3,
  },
  {
    name: 'connection-string-password',
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]{3,})(@)/gi,
    group: 2,
  },
];

const PLACEHOLDER = '[redacted]';

/**
 * Values that are references or placeholders, not secrets.
 *
 * `--password="$DB_PASS"` in a shell script and `password: "{{ vault }}"` in a
 * template both match the assignment shape, but redacting them hides the very
 * thing a reader needs to see: where the value comes from. Redacting these is
 * worse than noise; it makes the evidence wrong.
 */
function isReferenceOrPlaceholder(value: string): boolean {
  if (/^(\$\{?|\{\{|%\w|<[^>]*>$|process\.env|env\(|getenv\()/i.test(value)) return true;
  // Repeated single character: "xxxxxxxx", "********", "........".
  if (/^(.)\1{7,}$/.test(value)) return true;
  if (/^(your[_-]|changeme|change[_-]me|example|placeholder|replace[_-]me|todo\b)/i.test(value)) {
    return true;
  }
  return false;
}

/**
 * Redact secrets while keeping the text's line structure identical.
 *
 * The placeholder contains no newline, and only the matched group is replaced,
 * so `text.split('\n').length` is unchanged.
 */
export function redactSecrets(text: string): RedactionResult {
  const findings: SecretFinding[] = [];
  let result = text;

  for (const rule of RULES) {
    // Each rule runs against the result of the previous one so overlapping
    // shapes (a JWT inside an assignment) are both handled.
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    result = result.replace(pattern, (...args: unknown[]) => {
      const match = args[0] as string;
      const groups = args.slice(1, -2) as (string | undefined)[];
      const offset = args[args.length - 2] as number;

      const secret = rule.group === 0 ? match : groups[rule.group - 1];
      if (secret === undefined || secret.length === 0) return match;
      // A match spanning a newline would break the line-count invariant.
      if (secret.includes('\n')) return match;
      if (isReferenceOrPlaceholder(secret)) return match;

      findings.push({ line: lineAt(result, offset), rule: rule.name });

      const start = match.indexOf(secret);
      if (start === -1) return match;
      return match.slice(0, start) + PLACEHOLDER + match.slice(start + secret.length);
    });
  }

  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return { text: result, findings };
}

/** 1-based line number of a character offset. */
function lineAt(text: string, offset: number): number {
  let line = 1;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}
