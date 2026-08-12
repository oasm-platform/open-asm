import { AuditOutcome } from '@/common/enums/enum';
import { MCP_API_KEY_HEADER } from '@/common/constants/app.constants';
import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { AUDIT_LOG_KEY } from './audit-log.decorator';
import type { AuditLogConfig } from './audit-log.decorator';
import type { AuditEventInput, AuditMetadataValue } from './audit.service';
import { AuditService } from './audit.service';

type AuditLogMetadata = { action: AuditEventInput['action'] } & AuditLogConfig;

/**
 * Outcome of running the user-supplied extractors behind the safety net. A
 * single throw from any extractor poisons the whole extraction (ok: false) —
 * the request itself is never affected.
 */
type ExtractResult =
  | {
      ok: true;
      changes?: AuditEventInput['changes'];
      metadata?: Record<string, AuditMetadataValue>;
      resourceId?: string;
      workspaceId?: string;
    }
  | { ok: false };

/**
 * Global interceptor (APP_INTERCEPTOR) that writes audit events for handlers
 * marked with @AuditLog. Pass-through when there is no metadata. v1 scope:
 * real user sessions inside a concrete workspace are recorded; requests that
 * authenticate via the MCP API key header (MCP_API_KEY_HEADER) are recorded
 * with actorType 'api_key'.
 *
 * The workspaceId resolution is deferred until the result is known: most
 * handlers get it from the request (set by WorkspacePermissionGuard), but
 * `workspace.created` has no request workspace yet, so the decorator supplies
 * `config.workspaceId(result)`. When neither resolves, the write is skipped.
 *
 * The audit write is fire-and-forget (`void auditSafely(...)`): it never
 * delays the response and `auditSafely` swallows its own errors, so a failing
 * audit write can never break the business response.
 *
 * All user-supplied extractors (changes/metadata/resourceId/workspaceId) run
 * through `extractSafely` exactly once per request, POST-handler only. A buggy
 * extractor is logged and skips the audit row for that request — it can never
 * turn a successful request into a 500, never double-invokes changes/metadata,
 * and never writes a bogus failure row for a request that actually succeeded.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Runs the config extractors behind a try/catch. On ANY extractor throw:
   * logs a warning and returns { ok: false } — the caller skips the audit
   * write for this request entirely (an extractor bug says nothing about the
   * request's outcome, so no success OR failure row may be derived from it).
   */
  private extractSafely(
    config: AuditLogMetadata,
    body: unknown,
    result: unknown,
  ): ExtractResult {
    try {
      return {
        ok: true,
        changes: config.changes?.(body, result),
        metadata: config.metadata?.(body, result),
        resourceId: config.resourceId?.(result),
        workspaceId: config.workspaceId?.(result),
      };
    } catch (error) {
      this.logger.warn(
        `Audit extractor failed for action '${config.action}'; skipping the audit write: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ok: false };
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const config = this.reflector.get<AuditLogMetadata>(
      AUDIT_LOG_KEY,
      context.getHandler(),
    );
    if (!config) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<RequestWithMetadata>();
    const hasUserIdentity = Boolean(req.session?.userId || req.user?.id);
    const hasApiKey = Boolean(req.headers?.[MCP_API_KEY_HEADER]);
    // Skip only when there is NO identity at all: neither a user session nor
    // an MCP API key. An API-key request must still be audited (actorType
    // api_key, actorId null) — the key IS the actor.
    if (!hasUserIdentity && !hasApiKey) {
      return next.handle();
    }

    const input: AuditEventInput = {
      ...this.auditService.buildActorContext(req),
      action: config.action,
      resourceType: config.resourceType ?? config.action.split('.')[0],
      outcome: AuditOutcome.Success,
    };

    return next.handle().pipe(
      tap((result) => {
        const extract = this.extractSafely(config, req.body, result);
        if (!extract.ok) {
          return;
        }
        const wid = req.workspaceId ?? extract.workspaceId;
        if (!wid) {
          return;
        }
        input.workspaceId = wid;
        input.resourceId = extract.resourceId;
        input.changes = extract.changes;
        input.metadata = extract.metadata;
        void this.auditService.auditSafely(input);
      }),
      catchError((error: unknown) => {
        const extract = this.extractSafely(config, req.body, undefined);
        if (!extract.ok) {
          return throwError(() => error);
        }
        const wid = req.workspaceId ?? extract.workspaceId;
        if (!wid) {
          return throwError(() => error);
        }
        input.workspaceId = wid;
        // Failed attempts correlate even when the extractor cannot resolve a
        // resourceId: fall back to the first route param value, then the
        // workspace.
        const routeId = Array.isArray(req.params?.id)
          ? req.params.id[0]
          : req.params?.id;
        input.resourceId =
          extract.resourceId ?? routeId ?? req.workspaceId;
        input.changes = extract.changes;
        input.metadata = extract.metadata;
        input.outcome = AuditOutcome.Failure;
        void this.auditService.auditSafely(input);
        return throwError(() => error);
      }),
    );
  }
}
