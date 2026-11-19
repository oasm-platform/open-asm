import {
  LOCAL_TRUSTED_ORIGINS,
  parseAllowedOrigins,
  resolveTrustedOrigins,
  trustedRequestOrigins,
} from './allowed-origins';

describe('resolveTrustedOrigins', () => {
  it('trusts no other origin when deployed with nothing configured', () => {
    expect(resolveTrustedOrigins({})).toEqual([]);
  });

  it('trusts the local dev servers in development and test', () => {
    expect(resolveTrustedOrigins({ NODE_ENV: 'development' })).toEqual(
      LOCAL_TRUSTED_ORIGINS,
    );
    expect(resolveTrustedOrigins({ NODE_ENV: 'test' })).toEqual(
      LOCAL_TRUSTED_ORIGINS,
    );
  });

  it('trusts the console origin from BASE_URL', () => {
    expect(
      resolveTrustedOrigins({ BASE_URL: 'https://app.example.com/console/' }),
    ).toEqual(['https://app.example.com']);
  });

  it('adds TRUSTED_ORIGINS as origins, without duplicates', () => {
    expect(
      resolveTrustedOrigins({
        BASE_URL: 'https://app.example.com',
        TRUSTED_ORIGINS: 'https://app.example.com/, https://ops.example.com:8443',
      }),
    ).toEqual(['https://app.example.com', 'https://ops.example.com:8443']);
  });

  it('ignores an unset or blank BASE_URL', () => {
    expect(resolveTrustedOrigins({ BASE_URL: '  ' })).toEqual([]);
  });

  it.each([
    ['TRUSTED_ORIGINS', 'app.example.com'],
    ['TRUSTED_ORIGINS', '*'],
    ['TRUSTED_ORIGINS', 'https://*.example.com'],
    ['TRUSTED_ORIGINS', 'chrome-extension://abcdef'],
    ['BASE_URL', 'app.example.com'],
  ])('refuses to boot on %s=%s', (variable, value) => {
    expect(() => resolveTrustedOrigins({ [variable]: value })).toThrow(
      variable,
    );
  });
});

describe('trustedRequestOrigins', () => {
  const allowed = ['https://app.example.com'];
  const requestWith = (headers: Record<string, string>) => ({
    headers: new Headers(headers),
  });

  it('returns the configured origins when there is no request', () => {
    expect(trustedRequestOrigins(allowed, undefined)).toEqual(allowed);
  });

  it('trusts the origin of a request the browser marks same-origin', () => {
    expect(
      trustedRequestOrigins(
        allowed,
        requestWith({
          origin: 'http://localhost:3000',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toEqual([...allowed, 'http://localhost:3000']);
  });

  it.each(['same-site', 'cross-site', 'none'])(
    'does not trust the origin of a %s request',
    (site) => {
      expect(
        trustedRequestOrigins(
          allowed,
          requestWith({ origin: 'https://evil.example', 'sec-fetch-site': site }),
        ),
      ).toEqual(allowed);
    },
  );

  it('does not trust the origin of a request without fetch metadata', () => {
    expect(
      trustedRequestOrigins(
        allowed,
        requestWith({ origin: 'https://evil.example' }),
      ),
    ).toEqual(allowed);
  });
});

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
      parseAllowedOrigins(undefined, LOCAL_TRUSTED_ORIGINS),
    ).toEqual(LOCAL_TRUSTED_ORIGINS);
  });

  it('returns fallback for whitespace-only input', () => {
    expect(parseAllowedOrigins('   ', [])).toEqual([]);
  });

  it('parses a single origin', () => {
    expect(parseAllowedOrigins('http://a', [])).toEqual(['http://a']);
  });
});
