import { AuditActorType, AuditOutcome } from '@/common/enums/enum';
import { MCP_API_KEY_HEADER } from '@/common/constants/app.constants';
import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { AuditAction } from './constants/audit-events';
import type { GetAuditEventsQueryDto } from './dto/audit.dto';
import { AuditEvent } from './entities/audit-event.entity';
import { redactSecrets } from '../event-bridge/redact-secrets';

/** Separator between the occurredAt ISO and the id inside a keyset cursor. */
const CURSOR_SEPARATOR = '|';

/** Hard ceiling for the CSV export (plan §7): beyond this → 400, narrow filters. */
const EXPORT_MAX_ROWS = 10_000;

/** Strict unpadded base64url alphabet — Node's lenient decoder ignores invalid chars. */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
/**
 * Strict ISO-8601 as emitted by encodeCursor (Date.prototype.toISOString):
 * YYYY-MM-DDTHH:mm:ss.sssZ. `new Date()` alone accepts non-ISO inputs like
 * '2026-08-10 10:00:00' — those must be rejected as malformed cursors.
 */
const CURSOR_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const CURSOR_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keyset cursor = base64url(`occurredAt ISO` + '|' + `id`). The tuple is the
 * stable sort key of the list query (occurredAt DESC, id DESC); id disambiguates
 * rows that share a timestamp, so pages never overlap or skip.
 */
export function encodeCursor(
  event: Pick<AuditEvent, 'occurredAt' | 'id'>,
): string {
  return Buffer.from(
    `${event.occurredAt.toISOString()}${CURSOR_SEPARATOR}${event.id}`,
    'utf8',
  ).toString('base64url');
}

/** Inverse of encodeCursor; throws 400 on any malformed cursor. */
export function decodeCursor(
  cursor: string,
): { occurredAt: Date; id: string } {
  // Strict base64url: reject any character outside the alphabet. Node's
  // Buffer.from(cursor, 'base64url') silently IGNORES invalid chars (so
  // '!<valid>' decodes fine) and accepts '=' padding — encodeCursor emits
  // unpadded canonical base64url, so both are malformed.
  if (!BASE64URL_RE.test(cursor)) {
    throw new BadRequestException('Invalid cursor');
  }
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const parts = raw.split(CURSOR_SEPARATOR);
  if (parts.length !== 2) {
    throw new BadRequestException('Invalid cursor');
  }
  const [iso, id] = parts;
  // Strict ISO-8601 in the exact toISOString() shape; the round-trip check
  // additionally rejects out-of-range dates that would otherwise normalize.
  if (!CURSOR_ISO_RE.test(iso) || !CURSOR_UUID_RE.test(id)) {
    throw new BadRequestException('Invalid cursor');
  }
  const occurredAt = new Date(iso);
  if (
    Number.isNaN(occurredAt.getTime()) ||
    occurredAt.toISOString() !== iso
  ) {
    throw new BadRequestException('Invalid cursor');
  }
  return { occurredAt, id };
}

/** Scalar context value: primitives plus id lists (e.g. invitationIds). */
export type AuditMetadataValue = string | number | boolean | string[];

export interface AuditEventInput {
  workspaceId?: string;
  /**
   * CloudEvents id of the originating stream entry, when the row came from the
   * audit sink. Omitted by explicit in-transaction writes, which mint their own.
   */
  eventId?: string;
  actorId?: string;
  actorType?: AuditActorType;
  actorName?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  outcome: AuditOutcome;
  sourceIp?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  changes?: Record<string, { before?: unknown; after?: unknown }>;
  metadata?: Record<string, AuditMetadataValue>;
}

/**
 * Actor context for explicit in-transaction audit writes (M4 wiring). Built
 * by controllers via `AuditService.buildActorContext(req)` and passed into
 * service methods that record critical events inside their own transaction —
 * the actor must come from the request (session + IP/UA), never guessed.
 */
export interface AuditContext {
  actorId?: string;
  actorType?: AuditActorType;
  actorName?: string;
  actorEmail?: string;
  sourceIp?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AuditEvent)
    private readonly auditEventRepo: Repository<AuditEvent>,
  ) {}

  /**
   * Writes one audit row on the caller's transaction manager.
   *
   * This is the SECOND of the two audit write paths, and it exists for a
   * specific reason. Most audited actions go through `@PublishEvent` and reach
   * the table asynchronously via the stream consumer. A handful cannot: they
   * must commit ATOMICALLY with the mutation, and they need a BEFORE state the
   * decorator cannot see (the row is already deleted, or the previous
   * permissions are only in hand inside the service).
   *
   * Those callers live in `WorkspacesService` — workspace.deleted,
   * member.removed, member.permissions.updated and the three permission_group
   * actions — and none of them is also decorated, so no action is written twice.
   * `audit-wiring` specs assert that absence; if you decorate one of those
   * handlers, the action gets a second row with a different `eventId`.
   *
   * `audit.exported` self-logs here too, for the same reason: it must be
   * recorded before the CSV starts streaming.
   *
   * Never catches: errors propagate so the surrounding transaction rolls back.
   */
  async recordInTx(
    manager: EntityManager,
    input: AuditEventInput,
  ): Promise<AuditEvent> {
    const entity = manager.create(AuditEvent, {
      // Not every row comes from the stream: the explicit in-transaction writes
      // (workspace.deleted, member.removed, permission groups) still mint their
      // own id so the UNIQUE column is always populated. The sink path supplies
      // the CloudEvents id instead, which is what makes ITS writes idempotent.
      eventId: input.eventId ?? randomUUID(),
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      actorType: input.actorType ?? AuditActorType.User,
      // entity columns are `?: string` (no null) — normalize null → undefined
      actorName: input.actorName ?? undefined,
      actorEmail: input.actorEmail ?? undefined,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: input.outcome,
      sourceIp: input.sourceIp,
      userAgent: input.userAgent,
      requestId: input.requestId,
      correlationId: input.correlationId,
      changes: this.redactSecrets<
        Record<string, { before?: unknown; after?: unknown }>
      >(input.changes ?? {}),
      metadata: this.redactSecrets<Record<string, AuditMetadataValue>>(
        input.metadata ?? {},
      ),
    });
    return manager.save(entity);
  }

  /**
   * Best-effort audit write (interceptor path, fire-and-forget): owns its own
   * transaction and NEVER throws — a failing audit write must not turn a
   * successful business request into a 500. Mirrors `notifySafely` in
   * workspaces.service.ts.
   */
  async auditSafely(input: AuditEventInput): Promise<void> {
    try {
      await this.dataSource.transaction((manager) =>
        this.recordInTx(manager, input),
      );
    } catch (error) {
      this.logger.error(
        'Failed to write audit event',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Derives the actor + request context for an audited handler. v1 scope:
   * when the request carries a user session → actorType User, else actorType
   * ApiKey (actorId null, actorName truncated from the API key header). Prefers
   * the current request's ip/user-agent over the session's login-time values
   * (which can be stale). The userAgent is capped at 512 chars.
   */
  buildActorContext(req: RequestWithMetadata): AuditContext {
    const headerUserAgent = req.headers['user-agent'];
    const apiKeyHeader = req.headers?.[MCP_API_KEY_HEADER];
    const hasUserIdentity = Boolean(
      req.user?.id ?? req.session?.userId,
    );
    const apiKeyActorName =
      typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0
        ? apiKeyHeader.slice(0, 64)
        : 'API key';
    return {
      actorId: req.user?.id ?? req.session?.userId,
      actorType: hasUserIdentity
        ? AuditActorType.User
        : AuditActorType.ApiKey,
      actorName: hasUserIdentity ? req.user?.name : apiKeyActorName,
      actorEmail: req.user?.email,
      sourceIp: req.ip ?? req.session?.ipAddress ?? undefined,
      userAgent:
        ((typeof headerUserAgent === 'string'
          ? headerUserAgent
          : undefined) ??
          req.session?.userAgent ??
          undefined)?.slice(0, 512),
      requestId: req.requestId,
    };
  }

  /**
   * Deep copy that (a) drops any key matching a secret pattern and (b)
   * replaces values that look like credentials with '***', recursively.
   *
   * Delegates to the event bus's shared {@link redactSecrets} so the audit
   * table and the event stream cannot drift into two different definitions of
   * what a secret is — a rule that differs between the two would mean data
   * scrubbed on one path and not the other. Kept as a method because the
   * in-transaction audit writes below call it through `this`.
   */
  redactSecrets<T extends Record<string, unknown>>(obj: T): T {
    return redactSecrets(obj);
  }

  /**
   * GDPR sweep: removes a member's PII from their audit rows. The append-only
   * trigger only allows UPDATEs while `app.audit_pii_sweep='on'`; the GUC is
   * set with is_local=true so it is scoped to this explicit transaction and
   * dies with it (the explicit reset is belt-and-suspenders).
   *
   * `targetEventId` optionally points at the member.removed event row that
   * carried the removed user's id in metadata.targetUserId (PII that survives
   * the actor sweep because that row's actorId is the *acting* user) — it is
   * nulled out in the same transaction.
   */
  async pseudonymizeActor(
    actorId: string,
    targetEventId?: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT set_config('app.audit_pii_sweep', 'on', true)`,
      );
      await manager.query(
        `UPDATE "audit_events"
         SET "actorName" = 'Deleted user', "actorEmail" = NULL, "sourceIp" = NULL, "userAgent" = NULL
         WHERE "actorId" = $1`,
        [actorId],
      );
      if (targetEventId) {
        await manager.query(
          `UPDATE "audit_events" SET "metadata" = "metadata" - 'targetUserId' WHERE "id" = $1`,
          [targetEventId],
        );
      }
      await manager.query(
        `SELECT set_config('app.audit_pii_sweep', 'off', true)`,
      );
    });
  }

  /**
   * Shared WHERE builder for the list + export queries. The workspace id is
   * ALWAYS the caller-supplied argument (tenant isolation — never derived
   * from user input). The keyset tuple `("occurredAt", "id") < (ts, id)` is
   * the plan §7 SQL verbatim: a plain find() cannot express a two-column
   * tuple comparison, so a query builder is used instead of OR-expanding the
   * condition (which would duplicate every other filter into both branches).
   */
  private buildEventQuery(
    workspaceId: string,
    dto: GetAuditEventsQueryDto,
  ) {
    const qb = this.auditEventRepo.createQueryBuilder('ae');
    qb.where('ae.workspaceId = :workspaceId', { workspaceId });
    if (dto.actorId) {
      qb.andWhere('ae.actorId = :actorId', { actorId: dto.actorId });
    }
    if (dto.action) {
      qb.andWhere('ae.action = :action', { action: dto.action });
    }
    if (dto.resourceType) {
      qb.andWhere('ae.resourceType = :resourceType', {
        resourceType: dto.resourceType,
      });
    }
    if (dto.outcome) {
      qb.andWhere('ae.outcome = :outcome', { outcome: dto.outcome });
    }
    if (dto.from) {
      qb.andWhere('ae.occurredAt >= :fromTs', { fromTs: new Date(dto.from) });
    }
    if (dto.to) {
      qb.andWhere('ae.occurredAt <= :toTs', { toTs: new Date(dto.to) });
    }
    if (dto.cursor) {
      const { occurredAt: cursorTs, id: cursorId } = decodeCursor(dto.cursor);
      qb.andWhere('(ae.occurredAt, ae.id) < (:cursorTs, :cursorId)', {
        cursorTs,
        cursorId,
      });
    }
    return qb
      .orderBy('ae.occurredAt', 'DESC')
      .addOrderBy('ae.id', 'DESC');
  }

  /**
   * Keyset-paginated list (plan §7/§10 S5): fetches limit+1 to detect the
   * next page, slices to limit, and encodes the last kept row as the
   * nextCursor (null when there is no next page).
   */
  async queryEvents(
    workspaceId: string,
    dto: GetAuditEventsQueryDto,
  ): Promise<{ data: AuditEvent[]; nextCursor: string | null }> {
    const limit = dto.limit ?? 20;
    const rows = await this.buildEventQuery(workspaceId, dto)
      .take(limit + 1)
      .getMany();
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return {
      data,
      nextCursor: hasMore ? encodeCursor(data[data.length - 1]) : null,
    };
  }

  /**
   * Read model for the CSV export: same filters as queryEvents, capped at
   * EXPORT_MAX_ROWS. A result exceeding the cap is a 400 telling the caller
   * to narrow the filters — the controller refuses BEFORE self-logging
   * audit.exported, so a rejected export never pollutes the trail.
   */
  async exportEvents(
    workspaceId: string,
    dto: GetAuditEventsQueryDto,
  ): Promise<AuditEvent[]> {
    const rows = await this.buildEventQuery(workspaceId, dto)
      .take(EXPORT_MAX_ROWS + 1)
      .getMany();
    if (rows.length > EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `Export is capped at ${EXPORT_MAX_ROWS.toLocaleString()} rows; narrow the filters and retry`,
      );
    }
    return rows;
  }
}
