import { describe, expect, it } from 'vitest';
import { formatBytes } from './format-bytes';

describe('formatBytes', () => {
  it.each([
    [0, '—'],
    [undefined, '—'],
    ['abc', '—'],
    [512, '512 B'],
    [1536, '1.5 KiB'],
    ['52428800', '50.0 MiB'],
    [1024 ** 3, '1.0 GiB'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});
