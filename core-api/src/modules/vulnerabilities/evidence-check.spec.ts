import {
  checkCitations,
  evidenceVerdict,
  findQuote,
  normalizeWhitespace,
} from './evidence-check';

const RUN_A = '00000000-0000-4000-8000-00000000000a';
const RUN_B = '00000000-0000-4000-8000-00000000000b';

const HTTP = [
  'HTTP/1.1 500 Internal Server Error',
  'Content-Type: text/html',
  '',
  '<b>Warning</b>:  pg_query(): Query failed: ERROR:  unterminated quoted string',
  '   at character 37',
].join('\r\n');

describe('normalizeWhitespace', () => {
  it('collapses every whitespace run and trims', () => {
    expect(normalizeWhitespace('  a\t\tb\r\n\n c  ')).toBe('a b c');
  });
});

describe('findQuote', () => {
  it('finds a quote whose spacing and line breaks differ, with its line and the line text', () => {
    expect(
      findQuote(HTTP, 'Query failed: ERROR: unterminated   quoted string at character 37'),
    ).toEqual({
      line: 4,
      excerpt:
        '<b>Warning</b>:  pg_query(): Query failed: ERROR:  unterminated quoted string\r\n   at character 37',
    });
    expect(findQuote(HTTP, 'HTTP/1.1 500 Internal')).toEqual({
      line: 1,
      excerpt: 'HTTP/1.1 500 Internal Server Error',
    });
  });

  it('is case-sensitive and rejects paraphrases', () => {
    expect(findQuote(HTTP, 'query failed: error')).toBeNull();
    expect(findQuote(HTTP, 'Query failed with an unterminated string')).toBeNull();
  });

  it('refuses quotes too short to prove anything', () => {
    expect(findQuote(HTTP, '500')).toBeNull();
    expect(findQuote(HTTP, '   ERROR   ')).toBeNull();
  });

  it('cuts the excerpt of a long line around the quote', () => {
    const output = `${'x'.repeat(5_000)} SECRET_TOKEN=abc123 ${'y'.repeat(5_000)}`;
    const match = findQuote(output, 'SECRET_TOKEN=abc123');
    expect(match?.line).toBe(1);
    expect(match?.excerpt).toMatch(/^….*SECRET_TOKEN=abc123.*…$/);
    expect(match!.excerpt.length).toBeLessThan(500);
  });

  it('maps offsets past leading whitespace and earlier runs', () => {
    const output = '\n\n   alpha    beta\n\tgamma delta-epsilon';
    expect(findQuote(output, 'gamma delta-epsilon')).toEqual({
      line: 4,
      excerpt: '\tgamma delta-epsilon',
    });
    expect(findQuote(output, 'beta gamma delta')?.line).toBe(3);
  });
});

describe('checkCitations', () => {
  const now = new Date('2026-11-10T10:00:00Z');
  const outputs = new Map<string, string | null>([
    [RUN_A, HTTP],
    [RUN_B, null],
  ]);

  it('is evidence_checked when every quote is in its own output', () => {
    const check = checkCitations(
      [
        { runId: RUN_A, quote: 'HTTP/1.1 500 Internal Server Error' },
        { runId: RUN_A, quote: 'unterminated quoted string' },
      ],
      outputs,
      now,
    );
    expect(check.verdict).toBe('evidence_checked');
    expect(check.checkedAt).toBe('2026-11-10T10:00:00.000Z');
    expect(check.citations.map((c) => [c.status, c.line])).toEqual([
      ['found', 1],
      ['found', 4],
    ]);
  });

  it('is unverified when a quote is missing, even if another run expired', () => {
    const check = checkCitations(
      [
        { runId: RUN_A, quote: 'HTTP/1.1 200 OK and welcome' },
        { runId: RUN_B, quote: 'anything at all here' },
      ],
      outputs,
      now,
    );
    expect(check.verdict).toBe('unverified');
    expect(check.citations).toEqual([
      { runId: RUN_A, quote: 'HTTP/1.1 200 OK and welcome', status: 'not_found' },
      { runId: RUN_B, quote: 'anything at all here', status: 'output_expired' },
    ]);
  });

  it('is output_expired when the found quotes leave an unreadable run', () => {
    const check = checkCitations(
      [
        { runId: RUN_A, quote: 'unterminated quoted string' },
        { runId: 'unknown-run', quote: 'not stored anywhere' },
      ],
      outputs,
      now,
    );
    expect(check.verdict).toBe('output_expired');
  });

  it('is unverified without citations', () => {
    expect(checkCitations([], outputs, now)).toEqual({
      verdict: 'unverified',
      checkedAt: '2026-11-10T10:00:00.000Z',
      citations: [],
    });
    expect(evidenceVerdict([])).toBe('unverified');
  });
});
