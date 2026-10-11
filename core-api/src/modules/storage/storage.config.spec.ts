import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  DEFAULT_RUSTFS_ENDPOINT,
  DEFAULT_S3_PRESIGN_TTL_SECONDS,
  DEFAULT_STORAGE_URL_BASE,
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
      urlBase: DEFAULT_STORAGE_URL_BASE,
      region: 'us-east-1',
      forcePathStyle: true,
      presignTtlSeconds: DEFAULT_S3_PRESIGN_TTL_SECONDS,
      corsAllowedOrigins: [],
      accessKey: '',
      secretKey: '',
      useDefaultCredentials: false,
    });
  });

  describe('urlBase', () => {
    it('defaults to the same-origin proxy prefix when STORAGE_URL_BASE is unset', () => {
      expect(parseStorageConfig(configFrom({})).urlBase).toBe('/api/storage');
    });

    it('treats an explicitly empty STORAGE_URL_BASE as absolute mode', () => {
      expect(
        parseStorageConfig(configFrom({ STORAGE_URL_BASE: '' })).urlBase,
      ).toBe('');
      expect(
        parseStorageConfig(configFrom({ STORAGE_URL_BASE: '   ' })).urlBase,
      ).toBe('');
    });

    it('keeps a non-empty base verbatim', () => {
      expect(
        parseStorageConfig(configFrom({ STORAGE_URL_BASE: '/api/storage' }))
          .urlBase,
      ).toBe('/api/storage');
    });

    it('trims and strips trailing slashes', () => {
      expect(
        parseStorageConfig(
          configFrom({ STORAGE_URL_BASE: '  /api/storage/  ' }),
        ).urlBase,
      ).toBe('/api/storage');
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

    it('clamps values above the maximum to 172800', () => {
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

    it('ignores the never-released S3_CORS_ALLOWED_ORIGINS name', () => {
      expect(
        parseStorageConfig(
          configFrom({ S3_CORS_ALLOWED_ORIGINS: 'http://legacy.example.com' }),
        ).corsAllowedOrigins,
      ).toEqual([]);
    });

    it('defaults to an empty array when unset', () => {
      expect(
        parseStorageConfig(configFrom({})).corsAllowedOrigins,
      ).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('credentials', () => {
    it('reads the RUSTFS_* pair without any deprecation warning', () => {
      const config = parseStorageConfig(
        configFrom({ RUSTFS_ACCESS_KEY: 'rk', RUSTFS_SECRET_KEY: 'rs' }),
      );

      expect(config.accessKey).toBe('rk');
      expect(config.secretKey).toBe('rs');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('ignores the never-released S3_ACCESS_KEY/S3_SECRET_KEY names', () => {
      const config = parseStorageConfig(
        configFrom({
          S3_ACCESS_KEY: 's3ak',
          S3_SECRET_KEY: 's3sk',
          RUSTFS_ACCESS_KEY: 'rk',
          RUSTFS_SECRET_KEY: 'rs',
        }),
      );

      expect(config.accessKey).toBe('rk');
      expect(config.secretKey).toBe('rs');
    });

    it('never mixes a half-set pair', () => {
      const config = parseStorageConfig(
        configFrom({ RUSTFS_ACCESS_KEY: 'rk' }),
      );

      expect(config.accessKey).toBe('');
      expect(config.secretKey).toBe('');
    });

    it('returns empty credentials when the pair is unset', () => {
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
