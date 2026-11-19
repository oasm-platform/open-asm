import { describe, expect, it } from 'vitest';

import {
  findMentionQuery,
  formatMention,
  splitMentions,
} from './agent-mentions';

describe('formatMention', () => {
  it('writes a plain value as is', () => {
    expect(formatMention('target', 'hackerone.com')).toBe(
      '@target:hackerone.com',
    );
  });

  it('quotes a value with spaces or quotes', () => {
    expect(formatMention('vulnerability', 'SQL Injection "login"')).toBe(
      '@vulnerability:"SQL Injection \\"login\\""',
    );
  });
});

describe('findMentionQuery', () => {
  it('finds the term typed after an "@" at the caret', () => {
    expect(findMentionQuery('scan @hack', 10)).toEqual({
      start: 5,
      query: 'hack',
    });
  });

  it('opens on a bare "@" at the start', () => {
    expect(findMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('ignores an "@" inside a word, a finished mention and text after a space', () => {
    expect(findMentionQuery('mail a@b.com', 12)).toBeNull();
    expect(findMentionQuery('@target:x', 9)).toBeNull();
    expect(findMentionQuery('@hack now', 9)).toBeNull();
  });

  it('only reads the text before the caret', () => {
    expect(findMentionQuery('@hackerone', 4)).toEqual({
      start: 0,
      query: 'hac',
    });
  });
});

describe('splitMentions', () => {
  it('splits mention tokens from plain text', () => {
    expect(
      splitMentions('check @target:hackerone.com and @vulnerability:"XSS in q" now'),
    ).toEqual([
      { text: 'check ', isMention: false },
      { text: '@target:hackerone.com', isMention: true },
      { text: ' and ', isMention: false },
      { text: '@vulnerability:"XSS in q"', isMention: true },
      { text: ' now', isMention: false },
    ]);
  });

  it('leaves unknown prefixes and agent mentions as text', () => {
    expect(splitMentions('@recon @port:80 a@asset:x')).toEqual([
      { text: '@recon @port:80 a@asset:x', isMention: false },
    ]);
  });
});
