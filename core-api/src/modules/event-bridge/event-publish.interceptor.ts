import { MCP_API_KEY_HEADER } from '@/common/constants/app.constants';
import { AuditActorType, AuditOutcome } from '@/common/enums/enum';
import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { resolveEventName } from '../connectors/event';
import { EventBridgeService } from './event-bridge.service';
import type { EventEnvelopeData } from './event-envelope';
import { isPersisted } from './event-policy';
import { PUBLISH_EVENT_KEY } from './publish-event.decorator';
import { redactSecrets } from './redact-secrets';
import type { PublishEventConfig } from './publish-event.decorator';

type PublishEventMetadata = { event: unknown } & PublishEventConfig;

type ExtractResult =
  | {
      ok: true;
      changes?: EventEnvelopeData['changes'];
      metadata?: EventEnvelopeData['metadata'];
      payload?: unknown;
      resourceId?: string;
      subject?: string;
      workspaceId?: string;
    }
  | { ok: false };

/**
 * Global interceptor that turns `@PublishEvent` handlers into stream entries.
 *
 * Replaces the old AuditInterceptor: the audit trail is now a SINK over the
 * stream rather than a producer-side write, so there is exactly one publish per
 * handler instead of `auditSafely` + `publish`.
 *
 * The workspaceId resolution is deferred until the result is known: most
 * handlers get it from the request (set by WorkspacePermissionGuard), but
 * `workspace.created` has no request workspace yet, so the decorator supplies
 * `config.workspaceId(result)`. When neither resolves the publish is SKIPPED —
 * an event with no workspace cannot be attributed, and writing a sentinel would
 * break the "stream holds exactly one workspace" invariant consumers filter on.
 *
 * Fire-and-forget: the publish is awaited inside `tap` for `persist: true`
 * events (so a Redis outage fails the request rather than silently losing audit)
 * and best-effort for the rest (a lost scan-progress signal must not fail a
 * scan). Errors are caught here so no event path can break the response.
 *
 * Every user-supplied extractor runs exactly once, behind a try/catch: a buggy
 * extractor is logged and skips the publish for that call — it can never turn a
 * successful request into a 500, never double-invoke, and never write a bogus
 * failure row for a request that actually succeeded.
 */
@Injectable()
export class EventPublishInterceptor implements NestInterceptor {
  private readonly logger = new Logger(EventPublishInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly eventBridge: EventBridgeService,
  ) {}

  private extractSafely(
    config: PublishEventMetadata,
    body: unknown,
    args: unknown,
    result: unknown,
  ): ExtractResult {
    try {
      return {
        ok: true,
        changes: config.changes?.(body, result),
        metadata: config.metadata?.(body, result),
        payload: config.payload?.(args, result),
        resourceId: config.resourceId?.(result),
        subject: config.subject?.(result),
        workspaceId: config.workspaceId?.(result),
      };
    } catch (error) {
      this.logger.warn(
        `Event extractor failed for '${this.describe(config.event)}'; skipping the publish: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ok: false };
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const config = this.reflector.get<PublishEventMetadata>(
      PUBLISH_EVENT_KEY,
      context.getHandler(),
    );
    if (!config) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<RequestWithMetadata>();
    const actor = this.resolveActor(req);
    if (!actor) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((result) => {
        void this.emit(req, config, actor, [req.body], result, AuditOutcome.Success);
      }),
      catchError((error: unknown) => {
        void this.emit(req, config, actor, [req.body], undefined, AuditOutcome.Failure, error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * Builds and publishes one envelope. Never throws: the caller awaits it from
   * a `tap`, where a rejection would surface as an unhandled rejection and,
   * on the failure path, could replace the original error the client must see.
   */
  private async emit(
    req: RequestWithMetadata,
    config: PublishEventMetadata,
    actor: NonNullable<ReturnType<EventPublishInterceptor['resolveActor']>>,
    args: unknown[],
    result: unknown,
    outcome: AuditOutcome,
    error?: unknown,
  ): Promise<void> {
    try {
      const name = resolveEventName(config.event as never);
      if (!name) {
        this.logger.error(
          `Refusing to publish undeclared event: ${this.describe(config.event)}`,
        );
        return;
      }

      const extract = this.extractSafely(config, req.body, args, result);
      if (!extract.ok) {
        return;
      }

      const workspaceId = req.workspaceId ?? extract.workspaceId;
      if (!workspaceId) {
        // No sentinel: an unattributable event is not an event. Skipped, not
        // defaulted — audit_events.workspace_id stays NOT NULL because of this.
        this.logger.warn(
          `No workspace resolved for '${name}'; skipping the publish`,
        );
        return;
      }

      const resourceType = config.resourceType ?? name.split('.')[0];
      // A failed request has no result to read an id from, so the route param is
      // the only thing that can still correlate the attempt to a resource — same
      // fallback the old audit interceptor used.
      const resourceId =
        extract.resourceId ??
        (outcome === AuditOutcome.Failure ? this.routeParamId(req) : undefined);
      const subject =
        extract.subject ??
        `workspace:${workspaceId}/${resourceType}${
          resourceId ? `:${resourceId}` : ''
        }`;

      const data: EventEnvelopeData = {
        workspaceId,
        outcome,
        ...(actor ? { actor } : {}),
        resourceType,
        ...(resourceId ? { resourceId } : {}),
        // Redaction happens HERE, at the producer, not in the sinks. A stream entry
        // is TRANSPORT: it sits in Redis and every lane reads it, including the
        // integrations lane that forwards it to customer webhooks. Redacting
        // per sink would leave the plaintext in Redis and in every lane that did
        // not remember to scrub.
        ...(extract.changes ? { changes: redactSecrets(extract.changes) } : {}),
        ...(extract.metadata
          ? { metadata: redactSecrets(extract.metadata) }
          : {}),
        ...(extract.payload !== undefined
          ? { payload: redactSecrets(extract.payload) }
          : {}),
        ...(req.ip ? { sourceIp: req.ip } : {}),
        ...(req.headers?.['user-agent']
          ? { userAgent: String(req.headers['user-agent']).slice(0, 512) }
          : {}),
        ...(req.requestId ? { requestId: req.requestId } : {}),
        ...(req.headers?.['x-correlation-id']
          ? { correlationId: String(req.headers['x-correlation-id']) }
          : {}),
      };

      if (isPersisted(name)) {
        await this.eventBridge.publish(name, data, { subject });
        return;
      }
      await this.eventBridge.publishSafely(name, data, { subject });
    } catch (publishError) {
      // `persist: true` throws on purpose (audit must not vanish silently) — log
      // it loudly, but never let the event path alter the request outcome.
      //
      // The label distinguishes WHICH branch failed. A bare outcome value reads
      // as "failed while succeeding", which sends you hunting in the wrong place
      // when the handler actually threw.
      this.logger.error(
        `Failed to publish '${this.describe(config.event)}' on the ${
          error ? 'handler-failure' : outcome
        } path: ${
          publishError instanceof Error ? publishError.stack : String(publishError)
        }`,
      );
    }
  }

  /**
   * First value of the `id` route param. Express types a repeated param as an
   * array, hence the unwrap.
   */
  private routeParamId(req: RequestWithMetadata): string | undefined {
    const id = req.params?.id;
    return Array.isArray(id) ? id[0] : id;
  }

  /**
   * Actor from the request: a session user, or the MCP API key (which IS the
   * actor, hence actorType api_key with no id). Returns null only when the
   * request carries no identity at all — those calls are left unevented rather
   * than attributed to "system".
   */
  private resolveActor(
    req: RequestWithMetadata,
  ): { type: AuditActorType; id?: string; name?: string; email?: string } | null {
    const hasUserIdentity = Boolean(req.session?.userId || req.user?.id);
    const hasApiKey = Boolean(req.headers?.[MCP_API_KEY_HEADER]);
    if (!hasUserIdentity && !hasApiKey) {
      return null;
    }

    const apiKeyHeader = req.headers?.[MCP_API_KEY_HEADER];
    return {
      type: hasUserIdentity ? AuditActorType.User : AuditActorType.ApiKey,
      ...(req.user?.id ?? req.session?.userId
        ? { id: req.user?.id ?? req.session?.userId }
        : {}),
      ...(hasUserIdentity
        ? { name: req.user?.name }
        : {
            name:
              typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0
                ? apiKeyHeader.slice(0, 64)
                : 'API key',
          }),
      ...(req.user?.email ? { email: req.user.email } : {}),
    };
  }

  private describe(event: unknown): string {
    if (typeof event === 'string') return event;
    const name = (event as { name?: string } | undefined)?.name;
    return name ?? '<unknown>';
  }
}