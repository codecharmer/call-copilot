import { describe, expect, it } from 'vitest';

import { redactSecrets } from '../src/secrets.js';

/** The invariant the whole module exists to protect. */
function lineCount(text: string): number {
  return text.split('\n').length;
}

describe('redactSecrets', () => {
  it('redacts an AWS access key id', () => {
    const { text, findings } = redactSecrets('const key = "AKIAIOSFODNN7EXAMPLE";');
    expect(text).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(text).toContain('[redacted]');
    expect(findings[0]?.rule).toBe('aws-access-key-id');
  });

  it('redacts GitHub, Stripe, OpenAI and Anthropic tokens', () => {
    const samples = [
      `ghp_${'a'.repeat(36)}`,
      // Assembled at runtime so GitHub's push protection does not read this
      // fixture as a live key. It is synthetic and never was a real credential.
      ['sk', 'live', '51H8xExampleKeyValue0000'].join('_'),
      `sk-proj-${'b'.repeat(32)}`,
      `sk-ant-${'c'.repeat(32)}`,
    ];
    for (const sample of samples) {
      const { text } = redactSecrets(`token = "${sample}"`);
      expect(text, sample).not.toContain(sample);
    }
  });

  it('redacts the value of an assignment but keeps the key name readable', () => {
    // The code still has to make sense as evidence after filtering.
    const { text } = redactSecrets('api_key = "s3cr3t-value-here"');
    expect(text).toContain('api_key');
    expect(text).not.toContain('s3cr3t-value-here');
  });

  it('redacts a password inside a connection string', () => {
    const { text } = redactSecrets('DATABASE_URL=postgres://admin:hunter2@db.internal:5432/app');
    expect(text).not.toContain('hunter2');
    expect(text).toContain('postgres://admin:');
    expect(text).toContain('@db.internal:5432/app');
  });

  it('marks the start of a private key block', () => {
    const { findings } = redactSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n');
    expect(findings.some((f) => f.rule === 'private-key-block')).toBe(true);
  });

  it('preserves the line count exactly', () => {
    const source = [
      'function connect() {',
      '  const apiKey = "AKIAIOSFODNN7EXAMPLE";',
      '  const url = "postgres://admin:hunter2@db/app";',
      '  return fetch(url);',
      '}',
    ].join('\n');
    const { text } = redactSecrets(source);
    expect(lineCount(text)).toBe(lineCount(source));
    expect(lineCount(text)).toBe(5);
  });

  it('keeps CRLF files at the same line count', () => {
    const source = 'a = "AKIAIOSFODNN7EXAMPLE";\r\nb = 2;\r\nc = 3;';
    const { text } = redactSecrets(source);
    expect(lineCount(text)).toBe(lineCount(source));
    expect(text).toContain('\r\n');
  });

  it('reports the 1-based line each secret was found on', () => {
    const source = ['line one', 'const k = "AKIAIOSFODNN7EXAMPLE";', 'line three'].join('\n');
    const { findings } = redactSecrets(source);
    expect(findings[0]?.line).toBe(2);
  });

  it('leaves ordinary code untouched', () => {
    // An over-eager filter corrupts evidence, which is its own failure mode.
    const source = [
      'const secretSauce = computeSauce();',
      'export function tokenize(input: string) { return input.split(" "); }',
      'const passwordField = form.querySelector("#password");',
      'const key = map.get(id);',
    ].join('\n');
    const { text, findings } = redactSecrets(source);
    expect(text).toBe(source);
    expect(findings).toEqual([]);
  });

  it('does not redact a short assigned value that is unlikely to be a secret', () => {
    const { text } = redactSecrets('password = "abc"');
    expect(text).toBe('password = "abc"');
  });

  it('is idempotent', () => {
    const once = redactSecrets('key = "AKIAIOSFODNN7EXAMPLE"').text;
    const twice = redactSecrets(once).text;
    expect(twice).toBe(once);
  });
});

describe('references and placeholders are not secrets', () => {
  it('leaves a shell variable reference alone', () => {
    // From a real WordPress test bootstrap: the value is a reference, and
    // redacting it would hide where the password comes from.
    const line = 'mysqladmin create $DB_NAME --user="$DB_USER" --password="$DB_PASS"';
    expect(redactSecrets(line).text).toBe(line);
  });

  it('leaves template and env placeholders alone', () => {
    for (const line of [
      'password: "{{ vault_db_password }}"',
      'api_key = "${API_KEY}"',
      'secret: "%SECRET%"',
      'token = "<your-token-here>"',
      'password = "xxxxxxxxxxxx"',
      'api_key = "changeme-later"',
    ]) {
      expect(redactSecrets(line).text, line).toBe(line);
    }
  });

  it('still redacts a literal that merely starts with a letter', () => {
    const { text } = redactSecrets('password = "hunter2hunter2"');
    expect(text).not.toContain('hunter2hunter2');
  });
});
