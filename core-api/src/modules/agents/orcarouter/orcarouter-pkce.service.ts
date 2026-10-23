import { RedisService } from '@/services/redis/redis.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ORCAROUTER_AUTH_CODE_TTL_SECONDS,
  ORCAROUTER_AUTHORIZE_PATH,
  ORCAROUTER_EXCHANGE_PATH,
  ORCAROUTER_REQUIRED_SCOPE,
  resolveOrcaRouterOrigins,
} from './orcarouter.constants';

const PREFIX = 'orcarouter:pkce:attempt:';
const RETRY = 'Start the connection again.';
const EXCHANGE_TIMEOUT_MS = 15_000;
const MAX_EXCHANGE_BYTES = 64 * 1024;

export interface OrcaRouterConnectAttempt {
  attemptId: string;
  authorizeUrl: string;
  expiresAt: Date;
}

export interface OrcaRouterGrant {
  apiKey: string;
  scope: string;
}

interface StoredAttempt {
  verifier: string;
  state: string;
  workspaceId: string;
  userId: string;
}

const b64url = (buffer: Buffer): string => buffer.toString('base64url');

/** `base64url(sha256(verifier))` — the mandatory S256 challenge. */
export const createCodeChallenge = (verifier: string): string =>
  b64url(createHash('sha256').update(verifier).digest());

/** Constant-time `state` comparison; both sides are hashed first. */
export const statesMatch = (expected: string, returned: string): boolean =>
  timingSafeEqual(
    createHash('sha256').update(expected).digest(),
    createHash('sha256').update(returned).digest(),
  );

/**
 * OAuth 2.0 + PKCE (RFC 7636), Flow B (out-of-band code). OASM is self-hosted,
 * so a loopback redirect is usually unreachable from the browser that opens
 * the consent screen; the operator pastes the code instead. The verifier is
 * minted per attempt from a crypto RNG and never leaves the server or a log.
 */
@Injectable()
export class OrcaRouterPkceService {
  constructor(private readonly redisService: RedisService) {}

  async start(
    workspaceId: string,
    userId: string,
  ): Promise<OrcaRouterConnectAttempt> {
    const verifier = b64url(randomBytes(32));
    const state = b64url(randomBytes(16));
    const attemptId = b64url(randomBytes(16));
    const url = new URL(
      `${resolveOrcaRouterOrigins().authBaseUrl}${ORCAROUTER_AUTHORIZE_PATH}`,
    );
    url.searchParams.set('callback_url', 'oob');
    url.searchParams.set('code_challenge', createCodeChallenge(verifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    url.searchParams.set('app_name', 'OASM');
    url.searchParams.set('scope', ORCAROUTER_REQUIRED_SCOPE);

    const stored: StoredAttempt = { verifier, state, workspaceId, userId };
    await this.redisService.setex(
      `${PREFIX}${attemptId}`,
      ORCAROUTER_AUTH_CODE_TTL_SECONDS,
      JSON.stringify(stored),
    );
    return {
      attemptId,
      authorizeUrl: url.toString(),
      expiresAt: new Date(
        Date.now() + ORCAROUTER_AUTH_CODE_TTL_SECONDS * 1000,
      ),
    };
  }

  /** Redeems the consent code; the attempt is consumed before the exchange. */
  async complete(args: {
    attemptId: string;
    code: string;
    workspaceId: string;
    userId: string;
    state?: string;
  }): Promise<OrcaRouterGrant> {
    const key = `${PREFIX}${args.attemptId}`;
    const raw = await this.redisService.get(key);
    const attempt = this.parse(raw);
    if (raw && !attempt) await this.redisService.del(key);
    if (!attempt) {
      throw new BadRequestException(
        `This OrcaRouter connection attempt has expired or was already used. ${RETRY}`,
      );
    }
    if (
      attempt.workspaceId !== args.workspaceId ||
      attempt.userId !== args.userId
    ) {
      throw new BadRequestException(
        `This OrcaRouter connection attempt belongs to a different session. ${RETRY}`,
      );
    }
    if (args.state !== undefined && !statesMatch(attempt.state, args.state)) {
      await this.redisService.del(key);
      throw new BadRequestException(
        `The OrcaRouter authorization response did not match this attempt. ${RETRY}`,
      );
    }
    // Single use: consume before the network call, so a code cannot be replayed.
    await this.redisService.del(key);
    const code = args.code.trim();
    if (!code) {
      throw new BadRequestException(
        'Paste the code shown on the OrcaRouter consent screen.',
      );
    }
    return this.exchange(code, attempt.verifier);
  }

  async cancel(attemptId: string): Promise<void> {
    await this.redisService.del(`${PREFIX}${attemptId}`);
  }

  private parse(raw: string | null): StoredAttempt | null {
    try {
      const value = JSON.parse(raw ?? '') as Partial<StoredAttempt>;
      const fields = [
        value.verifier,
        value.state,
        value.workspaceId,
        value.userId,
      ];
      return fields.every((field) => typeof field === 'string')
        ? (value as StoredAttempt)
        : null;
    } catch {
      return null;
    }
  }

  private async exchange(
    code: string,
    verifier: string,
  ): Promise<OrcaRouterGrant> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(
        `${resolveOrcaRouterOrigins().authBaseUrl}${ORCAROUTER_EXCHANGE_PATH}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: verifier,
            code_challenge_method: 'S256',
          }),
          signal: controller.signal,
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Could not reach OrcaRouter to finish the connection. Check your network and try again.',
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw this.mapError(response.status);

    const grant = await this.readBody(response);
    const key = typeof grant?.key === 'string' ? grant.key : '';
    if (!key.startsWith('sk-orca-')) {
      throw new ServiceUnavailableException(
        `OrcaRouter did not return a usable API key. ${RETRY}`,
      );
    }
    const scope = typeof grant?.scope === 'string' ? grant.scope : '';
    if (scope !== ORCAROUTER_REQUIRED_SCOPE) {
      // The granted scope is authoritative; never assume the requested one.
      throw new BadRequestException(
        `OrcaRouter granted the "${scope || 'unknown'}" scope, which cannot make inference calls. Ask an admin to approve the "api" scope.`,
      );
    }
    return { apiKey: key, scope };
  }

  private mapError(status: number): HttpException {
    if (status === 400) {
      return new BadRequestException(
        `OrcaRouter rejected the code exchange request. ${RETRY}`,
      );
    }
    if (status === 403) {
      return new BadRequestException(
        `This authorization code is unknown, expired or already used. ${RETRY}`,
      );
    }
    if (status === 429) {
      return new HttpException(
        'Too many OrcaRouter authorizations were created in the last 24 hours. Use an existing API key or try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return new ServiceUnavailableException(
      'OrcaRouter could not complete the connection right now. Try again shortly.',
    );
  }

  private async readBody(
    response: Response,
  ): Promise<{ key?: unknown; scope?: unknown } | null> {
    try {
      const text = await response.text();
      return text.length > MAX_EXCHANGE_BYTES
        ? null
        : (JSON.parse(text) as { key?: unknown; scope?: unknown });
    } catch {
      return null;
    }
  }
}
