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

const GENERATION = 'orcarouter:cred:generation:';
const REAUTH = 'orcarouter:cred:needs-reauth:';

/** Detects a 401 from AI SDK / fetch style errors, without logging the error. */
export function isUnauthorizedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    cause?: unknown;
    message?: unknown;
  };
  if ((candidate.statusCode ?? candidate.status) === 401) return true;
  if (candidate.cause && candidate.cause !== error) {
    if (isUnauthorizedError(candidate.cause)) return true;
  }
  return (
    typeof candidate.message === 'string' &&
    /\b(401|unauthorized|invalid api key|invalid_api_key)\b/i.test(
      candidate.message,
    )
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
    // Format check only; validity is established by the first real request.
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

  /** Opaque, non-reversible credential generation identifier. */
  fingerprint(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex').slice(0, 32);
  }

  /** Records the generation now in use and clears any stale reauth marker. */
  async recordCredential(configId: string, apiKey: string): Promise<void> {
    await this.redisService.setex(
      `${GENERATION}${configId}`,
      60 * 60 * 24 * 30,
      this.fingerprint(apiKey),
    );
    await this.redisService.del(`${REAUTH}${configId}`);
  }

  /**
   * Marks the exact generation that was rejected. Never refreshes and never
   * deletes the stored key — a PKCE key is durable, not a refresh token.
   * Returns false for a stale report from an older key.
   */
  async reportUnauthorized(
    configId: string,
    rejectedApiKey: string,
  ): Promise<boolean> {
    const current = await this.redisService.get(`${GENERATION}${configId}`);
    if (current && current !== this.fingerprint(rejectedApiKey)) return false;

    await this.redisService.setex(`${REAUTH}${configId}`, 60 * 60 * 24 * 7, '1');
    this.logger.warn(
      `OrcaRouter credential ${configId} rejected by the gateway; reauthentication required`,
    );
    return true;
  }

  async isNeedsReauth(configId: string): Promise<boolean> {
    return (await this.redisService.get(`${REAUTH}${configId}`)) === '1';
  }
}
