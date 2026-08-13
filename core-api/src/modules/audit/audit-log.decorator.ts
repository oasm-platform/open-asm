import { SetMetadata } from '@nestjs/common';
import type { AuditAction } from './constants/audit-events';

export const AUDIT_LOG_KEY = 'audit_log_key';

export interface AuditLogConfig {
  /** Fallback resourceType: `action.split('.')[0]` when omitted. */
  resourceType?: string;
  /** Extracts the resourceId from the handler's success result. */
  resourceId?: (result: unknown) => string | undefined;
  /**
   * Extracts the workspaceId from the handler's success result. Used for
   * actions where the workspace is created by the call (e.g.
   * `workspace.created`) — there is no request workspaceId yet, and the
   * interceptor skips the write when neither `req.workspaceId` nor this
   * resolver yields one.
   */
  workspaceId?: (result: unknown) => string | undefined;
  /** Computes the before/after diff from the request body (+ result). */
  changes?: (
    body: unknown,
    result: unknown,
  ) => Record<string, { before?: unknown; after?: unknown }>;
  /**
   * Scalar context for the event (counts, ids, enums). Never pass emails,
   * tokens, keys or raw config values here — values matching a secret key
   * pattern are stripped by `redactSecrets` at write time.
   */
  metadata?: (
    body: unknown,
    result: unknown,
  ) => Record<string, string | number | boolean | string[]>;
}

/**
 * Marks a controller handler as audited: stores `{ action, ...config }` under
 * `AUDIT_LOG_KEY`, consumed by the global AuditInterceptor. Mirrors the
 * WorkspaceAccess decorator pattern (decorator metadata + guard/interceptor).
 *
 * @example
 * @AuditLog('target.created', {
 *   resourceId: (result) => result.id,
 *   changes: (body) => ({ name: { after: (body as CreateTargetDto).name } }),
 * })
 */
export function AuditLog(
  action: AuditAction,
  config: AuditLogConfig = {},
): MethodDecorator {
  return SetMetadata(AUDIT_LOG_KEY, { action, ...config });
}
