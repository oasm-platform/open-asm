import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';

/**
 * RFC 4122 UUID shape, version-agnostic: a client may legitimately propagate a
 * v1/v4/v7 id. Only well-formed ids are accepted so a hostile header value can
 * never reach the `requestId uuid` column of audit_events.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Assigns a correlation id to every request and mirrors it into the
 * `X-Request-Id` response header.
 *
 * Behavior (documented decision):
 * - A well-formed incoming `X-Request-Id` (RFC 4122 UUID) is honored so the id
 *   propagates across hops (client -> API -> audit row) for correlation.
 * - Otherwise a fresh UUID v4 is generated via `crypto.randomUUID()`.
 * - An already-set `req.requestId` is kept, making the middleware idempotent.
 *
 * Registered first in main.ts so every downstream middleware/guard/handler and
 * the audit log see the same id.
 */
export function requestIdMiddleware(
  req: RequestWithMetadata,
  res: Response,
  next: NextFunction,
): void {
  if (!req.requestId) {
    const incoming = req.headers['x-request-id'];
    const incomingId = Array.isArray(incoming) ? incoming[0] : incoming;
    req.requestId =
      incomingId !== undefined && UUID_RE.test(incomingId)
        ? incomingId
        : randomUUID();
  }
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
