import { describe, expect, it } from 'vitest';

import { buildSplitForm, queryTerms, splitIdentifier } from '../src/identifiers.js';

describe('splitIdentifier', () => {
  it('splits camelCase', () => {
    expect(splitIdentifier('processWebhook')).toEqual(['process', 'Webhook']);
  });

  it('splits PascalCase', () => {
    expect(splitIdentifier('PaymentProcessor')).toEqual(['Payment', 'Processor']);
  });

  it('splits snake_case and SCREAMING_SNAKE_CASE', () => {
    expect(splitIdentifier('process_webhook')).toEqual(['process', 'webhook']);
    expect(splitIdentifier('MAX_RETRY_COUNT')).toEqual(['MAX', 'RETRY', 'COUNT']);
  });

  it('splits kebab-case and dotted paths', () => {
    expect(splitIdentifier('process-webhook')).toEqual(['process', 'webhook']);
    expect(splitIdentifier('payment.processor')).toEqual(['payment', 'processor']);
  });

  it('breaks an acronym before a following word', () => {
    expect(splitIdentifier('HTTPServer')).toEqual(['HTTP', 'Server']);
    expect(splitIdentifier('parseJSONResponse')).toEqual(['parse', 'JSON', 'Response']);
  });

  it('keeps digits attached to the word they trail', () => {
    expect(splitIdentifier('utf8Decode')).toEqual(['utf8', 'Decode']);
    expect(splitIdentifier('sha256Hash')).toEqual(['sha256', 'Hash']);
  });

  it('returns a single-word identifier unchanged', () => {
    expect(splitIdentifier('webhook')).toEqual(['webhook']);
  });

  it('returns nothing for an empty identifier', () => {
    expect(splitIdentifier('')).toEqual([]);
  });
});

describe('buildSplitForm', () => {
  it('produces the terms a spoken question would use', () => {
    // Verified against SQLite FTS5: without this column, a search for
    // 'webhook' against 'processWebhook' returns zero rows, because the
    // default tokenizer emits the single token 'processwebhook'.
    const split = buildSplitForm('function processWebhook(req) { return handleRetry(req); }');
    expect(split.split(' ')).toContain('process');
    expect(split.split(' ')).toContain('webhook');
    expect(split.split(' ')).toContain('handle');
    expect(split.split(' ')).toContain('retry');
  });

  it('omits words that were already single tokens', () => {
    // They are already findable through the original-text column.
    expect(buildSplitForm('const total = count;')).toBe('');
  });

  it('deduplicates repeated identifiers', () => {
    const terms = buildSplitForm('processWebhook(); processWebhook();').split(' ');
    expect(terms.filter((t) => t === 'webhook').length).toBe(1);
  });
});

describe('queryTerms', () => {
  it('drops stop words from a spoken question', () => {
    const terms = queryTerms('how does the payment processor handle a retry');
    expect(terms).not.toContain('how');
    expect(terms).not.toContain('the');
    expect(terms).toContain('payment');
    expect(terms).toContain('processor');
    expect(terms).toContain('retry');
  });

  it('keeps an identifier and adds its split parts', () => {
    const terms = queryTerms('where is processWebhook called');
    expect(terms).toContain('processwebhook');
    expect(terms).toContain('process');
    expect(terms).toContain('webhook');
  });

  it('returns nothing useful for a content-free question', () => {
    expect(queryTerms('what is it')).toEqual([]);
  });
});
