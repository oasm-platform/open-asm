import { truncateUrl } from '@/utils/string';

describe('truncateUrl', () => {
  it('returns the url unchanged if shorter than maxLength', () => {
    expect(truncateUrl('https://example.com', 60)).toBe('https://example.com');
  });

  it('returns the url unchanged if exactly maxLength', () => {
    const url = 'a'.repeat(60);
    expect(truncateUrl(url, 60)).toBe(url);
  });

  it('truncates long url with default maxLength', () => {
    const url = 'https://example.com/very/long/path/that/exceeds/the/default/maximum/length/easily';
    const result = truncateUrl(url);
    expect(result.length).toBeLessThanOrEqual(63); // 30 + 3 + 30
    expect(result).toContain('...');
  });

  it('truncates long url with custom maxLength', () => {
    const url = 'https://example.com/very/long/path';
    const result = truncateUrl(url, 20);
    expect(result.length).toBeLessThanOrEqual(23); // 10 + 3 + 10
    expect(result).toContain('...');
    expect(result.startsWith('https://ex')).toBe(true);
    expect(result.endsWith('path')).toBe(true);
  });

  it('preserves start and end of url when truncating', () => {
    const url = 'https://www.example.com/some/really/long/path/to/a/resource';
    const result = truncateUrl(url, 30);
    const half = Math.floor(30 / 2);
    expect(result.startsWith(url.slice(0, half))).toBe(true);
    expect(result.endsWith(url.slice(-half))).toBe(true);
    expect(result).toContain('...');
  });

  it('handles empty string', () => {
    expect(truncateUrl('', 60)).toBe('');
  });

  it('handles very small maxLength', () => {
    const result = truncateUrl('https://example.com', 4);
    expect(result).toContain('...');
  });
});
