import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { parseAllowedOrigins } from '@/common/config/allowed-origins';

/**
 * Minimal shape of `ConfigService` the helper depends on. Accepting a callback
 * object instead of the concrete class keeps the parser pure and trivially
 * unit-testable.
 */
export interface StorageConfigSource {
  get<T = string>(key: string, defaultValue?: T): T | undefined;
}

export interface StorageConfig {
  /** Browser-reachable storage origin used to sign presigned URLs. */
  publicEndpoint: string;
  /**
   * Same-origin prefix the browser hits for storage. Unset => `/api/storage`
   * (relative mode: presign against `RUSTFS_ENDPOINT` path-style and prefix the
   * path with this base). Explicitly empty => absolute mode (URLs point at
   * `publicEndpoint`, cloud S3). Trailing slashes stripped.
   */
  urlBase: string;
  region: string;
  forcePathStyle: boolean;
  /** Clamped into [MIN_S3_PRESIGN_TTL_SECONDS, MAX_S3_PRESIGN_TTL_SECONDS]. */
  presignTtlSeconds: number;
  /** Trimmed, empty entries dropped. */
  corsAllowedOrigins: string[];
  accessKey: string;
  secretKey: string;
  useDefaultCredentials: boolean;
}

export const DEFAULT_RUSTFS_ENDPOINT = 'http://localhost:9000';
/** Same-origin proxy prefix (vite dev proxy + console nginx). Set empty for absolute mode. */
export const DEFAULT_STORAGE_URL_BASE = '/api/storage';
export const DEFAULT_S3_REGION = 'us-east-1';
export const DEFAULT_S3_FORCE_PATH_STYLE = true;
export const DEFAULT_S3_PRESIGN_TTL_SECONDS = 172800;
export const MIN_S3_PRESIGN_TTL_SECONDS = 60;
export const MAX_S3_PRESIGN_TTL_SECONDS = 172800;
export const DEFAULT_S3_USE_DEFAULT_CREDENTIALS = false;

const logger = new Logger('StorageConfig');

function readString(source: StorageConfigSource, key: string): string {
  const raw = source.get<string>(key);
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Strict boolean parse: only `true`/`false` accepted; anything else warns. */
function parseBoolean(
  source: StorageConfigSource,
  key: string,
  fallback: boolean,
): boolean {
  const raw = readString(source, key);
  if (raw === '') {
    return fallback;
  }
  const normalized = raw.toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  logger.warn(
    `Invalid boolean for ${key}="${raw}", falling back to ${fallback}`,
  );
  return fallback;
}

/** Numeric parse with a default for non-numeric input; valid numbers clamp. */
function parsePresignTtl(source: StorageConfigSource): number {
  const raw = readString(source, 'S3_PRESIGN_TTL');
  if (raw === '') {
    return DEFAULT_S3_PRESIGN_TTL_SECONDS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    logger.warn(
      `Invalid number for S3_PRESIGN_TTL="${raw}", falling back to ${DEFAULT_S3_PRESIGN_TTL_SECONDS}`,
    );
    return DEFAULT_S3_PRESIGN_TTL_SECONDS;
  }
  return Math.min(
    MAX_S3_PRESIGN_TTL_SECONDS,
    Math.max(MIN_S3_PRESIGN_TTL_SECONDS, Math.trunc(parsed)),
  );
}

/** Static credentials as an atomic pair; a half-set pair yields empty (never mixed). */
function parseCredentials(source: StorageConfigSource): {
  accessKey: string;
  secretKey: string;
} {
  const accessKey = readString(source, 'RUSTFS_ACCESS_KEY');
  const secretKey = readString(source, 'RUSTFS_SECRET_KEY');
  return accessKey && secretKey
    ? { accessKey, secretKey }
    : { accessKey: '', secretKey: '' };
}

/** Unset => same-origin proxy prefix; explicitly empty => absolute mode. */
function parseUrlBase(source: StorageConfigSource): string {
  const raw = source.get<string>('STORAGE_URL_BASE');
  const base = typeof raw === 'string' ? raw : DEFAULT_STORAGE_URL_BASE;
  return base.trim().replace(/\/+$/, '');
}

/**
 * Reads and validates every presign-related env var. Never throws: any invalid
 * value falls back to its default and logs a warning, so a bad env cannot crash
 * boot.
 */
export function parseStorageConfig(
  source: ConfigService | StorageConfigSource,
): StorageConfig {
  const { accessKey, secretKey } = parseCredentials(source);
  return {
    publicEndpoint:
      readString(source, 'S3_PUBLIC_ENDPOINT') ||
      readString(source, 'RUSTFS_ENDPOINT') ||
      DEFAULT_RUSTFS_ENDPOINT,
    urlBase: parseUrlBase(source),
    region: readString(source, 'S3_REGION') || DEFAULT_S3_REGION,
    forcePathStyle: parseBoolean(
      source,
      'S3_FORCE_PATH_STYLE',
      DEFAULT_S3_FORCE_PATH_STYLE,
    ),
    presignTtlSeconds: parsePresignTtl(source),
    corsAllowedOrigins: parseAllowedOrigins(
      readString(source, 'CORS_ALLOWED_ORIGINS'),
    ),
    accessKey,
    secretKey,
    useDefaultCredentials: parseBoolean(
      source,
      'S3_USE_DEFAULT_CREDENTIALS',
      DEFAULT_S3_USE_DEFAULT_CREDENTIALS,
    ),
  };
}
