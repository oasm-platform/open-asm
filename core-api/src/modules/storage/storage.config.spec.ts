import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  DEFAULT_RUSTFS_ENDPOINT,
  DEFAULT_S3_PRESIGN_TTL_SECONDS,
  MAX_S3_PRESIGN_TTL_SECONDS,
  MIN_S3_PRESIGN_TTL_SECONDS,
  parseStorageConfig,
} from './storage.config';

/** Minimal stand-in for ConfigService backed by a plain env map. */
function configFrom(env: Record<string, string>): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      env[key] !== undefined ? env[key] : defaultValue,
  } as unknown as ConfigService;
}

describe('parseStorageConfig', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns defaults for an empty environment', () => {
    const config = parseStorageConfig(configFrom({}));

    expect(config).toEqual({
      publicEndpoint: DEFAULT_RUSTFS_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      presignTtlSeconds: DEFAULT_S3_PRESIGN_TTL_SECONDS,
      corsAllowedOrigins: [],
      accessKey: '',
      secretKey: '',
      useDefaultCredentials: false,
    });
  });

  it('falls back publicEndpoint to RUSTFS_ENDPOINT', () => {
    const config = parseStorageConfig(
      configFrom({ RUSTFS_ENDPOINT: 'http://rustfs:9000' }),
    );

    expect(config.publicEndpoint).toBe('http://rustfs:9000');
  });

  it('prefers S3_PUBLIC_ENDPOINT over RUSTFS_ENDPOINT', () => {
    const config = parseStorageConfig(
      configFrom({
        S3_PUBLIC_ENDPOINT: 'https://cdn.example.com',
        RUSTFS_ENDPOINT: 'http://rustfs:9000',
      }),
    );

    expect(config.publicEndpoint).toBe('https://cdn.example.com');
  });

  describe('presignTtlSeconds', () => {
    it('clamps values below the minimum to 60', () => {
      expect(
        parseStorageConfig(configFrom({ S3_PRESIGN_TTL: '30' }))
          .presignTtlSeconds,
      ).toBe(MIN_S3_PRESIGN_TTL_SECONDS);
    });

    it('clamps values above the maximum to 604800', () => {
      expect(
        parseStorageConfig(configFrom({ S3_PRESIGN_TTL: '999999999' }))
          .presignTtlSeconds,
      ).toBe(MAX_S3_PRESIGN_TTL_SECONDS);
    });

    it('returns the default for non-numeric input and warns', () => {
      expect(
        parseStorageConfig(configFrom({ S3_PRESIGN_TTL: 'abc' }))
          .presignTtlSeconds,
      ).toBe(DEFAULT_S3_PRESIGN_TTL_SECONDS);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('accepts in-range values', () => {
      expect(
        parseStorageConfig(configFrom({ S3_PRESIGN_TTL: '1200' }))
          .presignTtlSeconds,
      ).toBe(1200);
    });
  });

  describe('forcePathStyle', () => {
    it('defaults to true for an invalid boolean and warns', () => {
      const config = parseStorageConfig(
        configFrom({ S3_FORCE_PATH_STYLE: 'maybe' }),
      );

      expect(config.forcePathStyle).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('parses false', () => {
      expect(
        parseStorageConfig(configFrom({ S3_FORCE_PATH_STYLE: 'false' }))
          .forcePathStyle,
      ).toBe(false);
    });
  });

  describe('corsAllowedOrigins', () => {
    it('uses the canonical list exactly', () => {
      const config = parseStorageConfig(
        configFrom({
          CORS_ALLOWED_ORIGINS: 'http://a, , http://b',
        }),
      );

      expect(config.corsAllowedOrigins).toEqual(['http://a', 'http://b']);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('falls back to the legacy list with exactly one deprecation warning', () => {
      const config = parseStorageConfig(
        configFrom({
          S3_CORS_ALLOWED_ORIGINS: 'http://a, , http://b',
        }),
      );

      expect(config.corsAllowedOrigins).toEqual(['http://a', 'http://b']);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/deprecat/i);
      expect(warnSpy.mock.calls[0][0]).toBe(
        'S3_CORS_ALLOWED_ORIGINS is deprecated, use CORS_ALLOWED_ORIGINS',
      );
    });

    it('prefers the canonical list when both are set with no legacy warning', () => {
      const config = parseStorageConfig(
        configFrom({
          CORS_ALLOWED_ORIGINS: 'https://canonical.example.com',
          S3_CORS_ALLOWED_ORIGINS: 'http://legacy.example.com',
        }),
      );

      expect(config.corsAllowedOrigins).toEqual([
        'https://canonical.example.com',
      ]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('defaults to an empty array when both are unset', () => {
      expect(
        parseStorageConfig(configFrom({})).corsAllowedOrigins,
      ).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('credentials', () => {
    it('parses access key, secret key and default-credentials flag', () => {
      const config = parseStorageConfig(
        configFrom({
          S3_ACCESS_KEY: 'ak',
          S3_SECRET_KEY: 'sk',
          S3_USE_DEFAULT_CREDENTIALS: 'true',
        }),
      );

      expect(config.accessKey).toBe('ak');
      expect(config.secretKey).toBe('sk');
      expect(config.useDefaultCredentials).toBe(true);
    });

    it('uses the S3 pair silently when both are set', () => {
      const config = parseStorageConfig(
        configFrom({ S3_ACCESS_KEY: 's3ak', S3_SECRET_KEY: 's3sk' }),
      );

      expect(config.accessKey).toBe('s3ak');
      expect(config.secretKey).toBe('s3sk');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('uses the legacy pair with exactly one deprecation warning', () => {
      const config = parseStorageConfig(
        configFrom({ RUSTFS_ACCESS_KEY: 'rk', RUSTFS_SECRET_KEY: 'rs' }),
      );

      expect(config.accessKey).toBe('rk');
      expect(config.secretKey).toBe('rs');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toBe(
        'RUSTFS_ACCESS_KEY/RUSTFS_SECRET_KEY are deprecated, use S3_ACCESS_KEY/S3_SECRET_KEY',
      );
    });

    it('prefers the S3 pair when both pairs are set', () => {
      const config = parseStorageConfig(
        configFrom({
          S3_ACCESS_KEY: 's3ak',
          S3_SECRET_KEY: 's3sk',
          RUSTFS_ACCESS_KEY: 'rk',
          RUSTFS_SECRET_KEY: 'rs',
        }),
      );

      expect(config.accessKey).toBe('s3ak');
      expect(config.secretKey).toBe('s3sk');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('falls through a half-set S3 pair to the full legacy pair without mixing', () => {
      const config = parseStorageConfig(
        configFrom({
          S3_ACCESS_KEY: 's3ak',
          RUSTFS_ACCESS_KEY: 'rk',
          RUSTFS_SECRET_KEY: 'rs',
        }),
      );

      expect(config.accessKey).toBe('rk');
      expect(config.secretKey).toBe('rs');
      expect(config.accessKey).not.toBe('s3ak');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toBe(
        'RUSTFS_ACCESS_KEY/RUSTFS_SECRET_KEY are deprecated, use S3_ACCESS_KEY/S3_SECRET_KEY',
      );
    });

    it('returns empty credentials when neither pair is set', () => {
      const config = parseStorageConfig(configFrom({}));

      expect(config.accessKey).toBe('');
      expect(config.secretKey).toBe('');
      expect(config.useDefaultCredentials).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('keeps empty credentials while respecting S3_USE_DEFAULT_CREDENTIALS', () => {
      const config = parseStorageConfig(
        configFrom({ S3_USE_DEFAULT_CREDENTIALS: 'true' }),
      );

      expect(config.accessKey).toBe('');
      expect(config.secretKey).toBe('');
      expect(config.useDefaultCredentials).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
