import { RedisService } from '@/services/redis/redis.service';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { OrcaRouterPkceService } from './orcarouter-pkce.service';

/**
 * Credential seam for OrcaRouter. Both adapters yield the same durable
 * `sk-orca-…` key, so downstream code never needs to know which one was used.
 */
export type OrcaRouterCredentialSource = 'api_key' | 'pkce';

export interface OrcaRouterCredential {
  apiKey: string;
  scope: string;
  source: OrcaRouterCredentialSource;
}

/** Set of fingerprints of the keys the gateway rejected, per connection. */
const REJECTED = 'orcarouter:cred:rejected:';

interface ErrorLike {
  statusCode?: unknown;
  status?: unknown;
  cause?: unknown;
  lastError?: unknown;
  message?: unknown;
}

/** HTTP status of an error, looking through `RetryError` and `cause` wrappers. */
function httpStatusOf(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== 'object' || error === null) return undefined;
  const candidate = error as ErrorLike;
  const status = candidate.statusCode ?? candidate.status;
  if (typeof status === 'number') return status;
  return (
    httpStatusOf(candidate.lastError, depth + 1) ??
    httpStatusOf(candidate.cause, depth + 1)
  );
}

/**
 * Detects a 401 from AI SDK / fetch style errors, without logging the error.
 * A status code, when present, is authoritative: a 403 policy denial whose
 * message reads "Unauthorized" is not a credential failure.
 */
export function isUnauthorizedError(error: unknown): boolean {
  const status = httpStatusOf(error);
  if (status !== undefined) return status === 401;
  const message = (error as ErrorLike | null)?.message;
  return (
    typeof message === 'string' &&
    /\b(401|invalid api key|invalid_api_key)\b/i.test(message)
  );
}

@Injectable()
export class OrcaRouterCredentialService {
  private readonly logger = new Logger(OrcaRouterCredentialService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly pkceService: OrcaRouterPkceService,
  ) {}

  /** Adapter 1 — a key the operator already holds. */
  fromApiKey(apiKey: string): OrcaRouterCredential {
    const key = apiKey.trim();
    if (!key) {
      throw new BadRequestException(
        'Paste an OrcaRouter API key (sk-orca-…) or use "Connect with OrcaRouter".',
      );
    }
    // Format check only; validity is established by the live model catalog.
    if (!key.startsWith('sk-orca-')) {
      throw new BadRequestException(
        'That does not look like an OrcaRouter API key. Keys start with "sk-orca-".',
      );
    }
    return { apiKey: key, scope: 'api', source: 'api_key' };
  }

  /** Adapter 2 — OAuth 2.0 + PKCE (Flow B, out-of-band code). */
  async fromPkce(args: {
    attemptId: string;
    code: string;
    workspaceId: string;
    userId: string;
    state?: string;
  }): Promise<OrcaRouterCredential> {
    const grant = await this.pkceService.complete(args);
    return { apiKey: grant.apiKey, scope: grant.scope, source: 'pkce' };
  }

  /** Opaque, non-reversible credential identifier. */
  fingerprint(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex').slice(0, 32);
  }

  /**
   * A key was stored on the connection. Saving a key again is the explicit way
   * to trust it again, so any earlier rejection of that exact key is dropped.
   */
  async recordCredential(configId: string, apiKey: string): Promise<void> {
    await this.bestEffort('record', () =>
      this.redisService.client.srem(
        `${REJECTED}${configId}`,
        this.fingerprint(apiKey),
      ),
    );
  }

  /**
   * Marks the exact key that was rejected. Never refreshes and never deletes
   * the stored key — a PKCE key is durable, not a refresh token. State is
   * keyed by key fingerprint, so a late 401 from a replaced key can never flag
   * its replacement, and a single SADD leaves no read-then-write race.
   * Returns true when the key is newly flagged.
   */
  async reportUnauthorized(
    configId: string,
    rejectedApiKey: string,
  ): Promise<boolean> {
    const added = await this.bestEffort('report', () =>
      this.redisService.client.sadd(
        `${REJECTED}${configId}`,
        this.fingerprint(rejectedApiKey),
      ),
    );
    if (!added) return false;
    this.logger.warn(
      `OrcaRouter credential ${configId} rejected by the gateway; reauthentication required`,
    );
    return true;
  }

  /** True when the key currently stored on the connection was rejected. */
  async isNeedsReauth(configId: string, apiKey: string): Promise<boolean> {
    const member = await this.bestEffort('read', () =>
      this.redisService.client.sismember(
        `${REJECTED}${configId}`,
        this.fingerprint(apiKey),
      ),
    );
    return member === 1;
  }

  /** Drops the state of a deleted connection. */
  async forget(configId: string): Promise<void> {
    await this.bestEffort('forget', () =>
      this.redisService.client.del(`${REJECTED}${configId}`),
    );
  }

  /**
   * Reauth state is advisory: a Redis failure must never fail creating,
   * updating or listing LLM connections.
   */
  private async bestEffort<T>(
    action: string,
    run: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await run();
    } catch (error) {
      this.logger.warn(
        `OrcaRouter credential state unavailable (${action}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }
}
