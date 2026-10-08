import {
  DEFAULT_CORS_ALLOWED_ORIGINS,
  parseAllowedOrigins,
} from './allowed-origins';

describe('parseAllowedOrigins', () => {
  it('parses csv and trims entries', () => {
    expect(
      parseAllowedOrigins('http://a, http://b ', []),
    ).toEqual(['http://a', 'http://b']);
  });

  it('drops empty entries', () => {
    expect(parseAllowedOrigins('http://a, , http://b', [])).toEqual([
      'http://a',
      'http://b',
    ]);
  });

  it('returns fallback for undefined', () => {
    expect(
      parseAllowedOrigins(undefined, DEFAULT_CORS_ALLOWED_ORIGINS),
    ).toEqual(DEFAULT_CORS_ALLOWED_ORIGINS);
  });

  it('returns fallback for whitespace-only input', () => {
    expect(parseAllowedOrigins('   ', [])).toEqual([]);
  });

  it('parses a single origin', () => {
    expect(parseAllowedOrigins('http://a', [])).toEqual(['http://a']);
  });
});
