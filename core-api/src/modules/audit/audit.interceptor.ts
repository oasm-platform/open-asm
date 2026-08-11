import { AuditOutcome } from '@/common/enums/enum';
import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { AUDIT_LOG_KEY } from './audit-log.decorator';
import type { AuditLogConfig } from './audit-log.decorator';
import type { AuditEventInput } from './audit.service';
import { AuditService } from './audit.service';

type AuditLogMetadata = { action: AuditEventInput['action'] } & AuditLogConfig;

/**
 * Global interceptor (APP_INTERCEPTOR) that writes audit events for handlers
 * marked with @AuditLog. Pass-through when there is no metadata. v1 scope:
 * only real user sessions inside a concrete workspace are recorded.
 *
 * The workspaceId resolution is deferred until the result is known: most
 * handlers get it from the request (set by WorkspacePermissionGuard), but
 * `workspace.created` has no request workspace yet, so the decorator supplies
 * `config.workspaceId(result)`. When neither resolves, the write is skipped.
 *
 * The audit write is fire-and-forget (`void auditSafely(...)`): it never
 * delays the response and `auditSafely` swallows its own errors, so a failing
 * audit write can never break the business response.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const config = this.reflector.get<AuditLogMetadata>(
      AUDIT_LOG_KEY,
      context.getHandler(),
    );
    if (!config) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<RequestWithMetadata>();
    if (!req.session?.userId && !req.user?.id) {
      return next.handle();
    }

    const input: AuditEventInput = {
      ...this.auditService.buildActorContext(req),
      action: config.action,
      resourceType: config.resourceType ?? config.action.split('.')[0],
      changes: config.changes?.(req.body, undefined),
      metadata: config.metadata?.(req.body, undefined),
      outcome: AuditOutcome.Success,
    };

    return next.handle().pipe(
      tap((result) => {
        const wid = req.workspaceId ?? config.workspaceId?.(result);
        if (!wid) {
          return;
        }
        input.workspaceId = wid;
        input.resourceId = config.resourceId?.(result);
        input.changes = config.changes?.(req.body, result);
        input.metadata = config.metadata?.(req.body, result);
        void this.auditService.auditSafely(input);
      }),
      catchError((error: unknown) => {
        const wid = req.workspaceId ?? config.workspaceId?.(undefined);
        if (!wid) {
          return throwError(() => error);
        }
        input.workspaceId = wid;
        input.outcome = AuditOutcome.Failure;
        void this.auditService.auditSafely(input);
        return throwError(() => error);
      }),
    );
  }
}
