import { AuditActorType, AuditOutcome } from '@/common/enums/enum';
import { EVENT_CATALOG } from '@/modules/event-bridge/contracts/event-catalog';
import { EventBridgeService } from '@/modules/event-bridge/publishing/event-bridge.service';
import { RedisService } from '@/services/redis/redis.service';
import { Injectable, Logger } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import {
  AgentHttpRequestPayload,
  type HttpHeaderPair,
} from './agent-http-request-payload.entity';
import { AgentHttpRequest } from './agent-http-request.entity';
import { AgentHttpOutcome } from './agent-http-request.enums';
import { toListItem } from './agent-http-request.mapper';
import {
  type HttpLogSession,
  httpLogChannel,
  loadHttpLogSessions,
} from './http-log-session';

interface ProtoTimestamp {
  seconds: string;
  nanos: number;
}

/** One `EgressHttpLog` as the Nest gRPC loader decodes it. */
export interface EgressHttpLogInput {
  id: string;
  sessionId: string;
  scheme: string;
  method: string;
  host: string;
  port: number;
  path: string;
  statusCode: number;
  outcome: string;
  error: string;
  requestBytes: string;
  responseBytes: string;
  sentAt?: ProtoTimestamp | null;
  completedAt?: ProtoTimestamp | null;
  requestHeaders: { name: string; value: string }[];
  responseHeaders: { name: string; value: string }[];
  requestBody: Buffer;
  responseBody: Buffer;
  requestBodyTruncated: boolean;
  responseBodyTruncated: boolean;
}

export interface IngestResult {
  accepted: number;
  rejected: number;
}

type RequestRow = Omit<AgentHttpRequest, 'conversation' | 'createdAt'>;
type AgentHttpRequestRow = Omit<AgentHttpRequest, 'conversation'>;
type PayloadRow = Omit<AgentHttpRequestPayload, 'request'>;

const BODY_CAP = 64 * 1024;
/** Above this a push would be a large Redis message; the console refetches instead. */
const MAX_PUSH_ROWS = 200;
const MAX_HEADERS = 100;
const MAX_HEADER_NAME = 256;
const MAX_HEADER_VALUE = 8192;
const MAX_PATH = 8192;
const MAX_ERROR = 500;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const MAX_INT = 2_147_483_647;
/** Sessions live 15 min; older events are bogus and may not fit timestamptz. */
const MAX_AGE_MS = 60 * 60 * 1000;
const METHOD = /^[A-Z][A-Z0-9_-]{0,15}$/;
const UINT = /^\d+$/;
const INT = /^-?\d+$/;

const OUTCOMES: Record<string, AgentHttpOutcome> = {
  EGRESS_HTTP_OUTCOME_ALLOWED: AgentHttpOutcome.ALLOWED,
  EGRESS_HTTP_OUTCOME_DENIED: AgentHttpOutcome.DENIED,
  EGRESS_HTTP_OUTCOME_UPSTREAM_ERROR: AgentHttpOutcome.UPSTREAM_ERROR,
  EGRESS_HTTP_OUTCOME_CANCELLED: AgentHttpOutcome.CANCELLED,
};

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
// Lone UTF-16 surrogates, which jsonb and text refuse.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Stores the HTTP requests a worker's egress proxy saw for agent shell
 * commands. The worker is not trusted for ownership: workspace, owner and
 * conversation come from the Redis session core-api wrote before the command
 * was pushed, and only the worker that session names may report for it.
 */
@Injectable()
export class AgentHttpIngestService {
  private readonly logger = new Logger(AgentHttpIngestService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly eventBridge: EventBridgeService,
  ) {}

  async ingest(
    workerId: string,
    logs: EgressHttpLogInput[],
    dropped: number,
  ): Promise<IngestResult> {
    if (dropped > 0) {
      this.logger.warn(
        `Worker ${workerId} dropped ${dropped} agent HTTP log events (buffer full)`,
      );
    }
    if (!logs.length) return { accepted: 0, rejected: 0 };

    const sessionIds = [
      ...new Set(
        logs
          .map((l) => l?.sessionId)
          .filter((s): s is string => typeof s === 'string' && isSessionId(s)),
      ),
    ];
    const rawSessions = await loadHttpLogSessions(this.redisService, sessionIds);

    const mapped: { request: RequestRow; payload: PayloadRow }[] = [];
    for (const log of logs) {
      const session = rawSessions.get(log?.sessionId);
      if (!session || !isValidSession(session) || session.workerId !== workerId) {
        continue;
      }
      const row = mapLog(log, session, Date.now());
      if (row) mapped.push(row);
    }

    // A conversation deleted between this check and the insert fails the
    // batch on its FK; the worker's retry then filters it out here.
    const live = await this.existingConversations(
      mapped.map((m) => m.request.conversationId),
    );
    const kept = mapped.filter((m) => live.has(m.request.conversationId));
    if (kept.length) {
      const inserted = await this.insert(kept);
      await this.announce(inserted);
    }

    return { accepted: kept.length, rejected: logs.length - kept.length };
  }

  private async existingConversations(ids: string[]): Promise<Set<string>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Set();
    const rows: { id: string }[] = await this.dataSource.query(
      'SELECT id FROM agent_conversations WHERE id = ANY($1)',
      [unique],
    );
    return new Set(rows.map((r) => r.id));
  }

  /** Returns only the rows this call stored, so a retried batch announces nothing twice. */
  private async insert(
    rows: { request: RequestRow; payload: PayloadRow }[],
  ): Promise<AgentHttpRequestRow[]> {
    // One INSERT cannot carry the same key twice and still map RETURNING ids
    // back to payloads; the first copy of an id wins.
    const byId = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!byId.has(r.request.id)) byId.set(r.request.id, r);
    const unique = [...byId.values()];

    return this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(AgentHttpRequest)
        .values(unique.map((r) => r.request))
        .orIgnore()
        .returning(['id', 'createdAt'])
        .execute();
      const createdAt = new Map(
        (result.raw as { id: string; createdAt: Date | string }[]).map((r) => [
          r.id,
          new Date(r.createdAt),
        ]),
      );
      const fresh = unique.filter((r) => createdAt.has(r.request.id));
      const stored = fresh.map((r) => ({
        ...r.request,
        createdAt: createdAt.get(r.request.id)!,
      }));
      if (!fresh.length) return stored;
      await manager
        .createQueryBuilder()
        .insert()
        .into(AgentHttpRequestPayload)
        .values(fresh.map((r) => r.payload))
        .orIgnore()
        .execute();
      return stored;
    });
  }

  /**
   * Tells the console about new rows, after the commit so a reader never sees
   * a row the list route cannot return yet. Two best-effort paths: the open
   * chat stream gets the rows themselves, and the owner's `/events/stream`
   * gets an ids-only hint, which covers background subagents after the turn
   * ended and the conversation opened in another tab.
   */
  private async announce(rows: AgentHttpRequestRow[]): Promise<void> {
    const byConversation = new Map<string, AgentHttpRequestRow[]>();
    for (const row of rows) {
      const list = byConversation.get(row.conversationId) ?? [];
      list.push(row);
      byConversation.set(row.conversationId, list);
    }
    await Promise.allSettled(
      [...byConversation].map(([conversationId, list]) =>
        // `actor.id` is what `/events/stream` routes on: only the owner's
        // connection to this workspace receives it.
        this.eventBridge.publishSafely(
          EVENT_CATALOG.agent.http_requests.recorded,
          {
            workspaceId: list[0].workspaceId,
            outcome: AuditOutcome.Success,
            actor: { type: AuditActorType.Agent, id: list[0].createdBy },
            resourceType: 'conversation',
            resourceId: conversationId,
            metadata: { count: list.length },
          },
        ),
      ),
    );
    await Promise.all(
      [...byConversation].map(async ([conversationId, list]) => {
        const body =
          list.length > MAX_PUSH_ROWS
            ? { refetch: true }
            : { requests: list.map((row) => toListItem(row)) };
        try {
          await this.redisService.publish(
            httpLogChannel(conversationId),
            JSON.stringify(body),
          );
        } catch (error) {
          this.logger.warn(
            `Could not announce agent HTTP requests of ${conversationId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
  }
}

function isSessionId(value: string): boolean {
  return value.length > 0 && value.length <= 64 && wellFormed(value) === value;
}

/** The session came through Redis as untyped JSON; trust none of it unchecked. */
function isValidSession(s: HttpLogSession): boolean {
  const optional = (v: unknown, check: (x: string) => boolean) =>
    v === null || v === undefined || (typeof v === 'string' && check(v));
  return (
    isUUID(s.workspaceId) &&
    isUUID(s.conversationId) &&
    isUUID(s.createdBy) &&
    typeof s.workerId === 'string' &&
    s.workerId.length > 0 &&
    typeof s.agentName === 'string' &&
    s.agentName.length > 0 &&
    s.agentName.length <= 100 &&
    optional(s.toolCallId, (v) => v.length <= 255) &&
    optional(s.subagentId, (v) => isUUID(v))
  );
}

function mapLog(
  log: EgressHttpLogInput,
  session: HttpLogSession,
  now: number,
): { request: RequestRow; payload: PayloadRow } | null {
  if (typeof log.id !== 'string' || !isUUID(log.id)) return null;

  const scheme = str(log.scheme).toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;

  const host = str(log.host).toLowerCase();
  if (!host || host.length > 255 || host.includes('\0')) return null;

  if (!Number.isInteger(log.port) || log.port < 1 || log.port > 65535) {
    return null;
  }

  const method = str(log.method);
  if (method && !METHOD.test(method)) return null;

  const path = str(log.path);
  if (path.length > MAX_PATH || path.includes('\0')) return null;

  const outcome = OUTCOMES[str(log.outcome)];
  if (outcome === undefined) return null;

  const status = log.statusCode ?? 0;
  if (!Number.isInteger(status)) return null;
  if (status !== 0 && (status < 100 || status > 599)) return null;

  const requestBytes = byteCount(log.requestBytes);
  const responseBytes = byteCount(log.responseBytes);
  if (requestBytes === null || responseBytes === null) return null;

  const sentMs = timestampMs(log.sentAt);
  const completedMs = timestampMs(log.completedAt);
  if (sentMs === null || completedMs === null) return null;
  if (sentMs > now + MAX_FUTURE_MS || sentMs < now - MAX_AGE_MS) return null;
  if (completedMs < sentMs) return null;
  const durationMs = completedMs - sentMs;
  if (durationMs > MAX_INT) return null;

  const error = cut(str(log.error), MAX_ERROR);
  const requestHeaders = headers(log.requestHeaders);
  const responseHeaders = headers(log.responseHeaders);
  const requestBody = body(log.requestBody, log.requestBodyTruncated);
  const responseBody = body(log.responseBody, log.responseBodyTruncated);
  const contentTypeHeader = responseHeaders.find(
    ([name]) => name.toLowerCase() === 'content-type',
  );
  const contentType = contentTypeHeader ? cut(contentTypeHeader[1], 255) : null;

  return {
    request: {
      id: log.id,
      conversationId: session.conversationId,
      workspaceId: session.workspaceId,
      createdBy: session.createdBy,
      toolCallId: session.toolCallId ?? null,
      runId: log.sessionId,
      subagentId: session.subagentId ?? null,
      agentName: session.agentName,
      workerId: session.workerId,
      scheme,
      method: method || null,
      host,
      port: log.port,
      path: path || null,
      statusCode: status === 0 ? null : status,
      outcome,
      error: error || null,
      requestBytes,
      responseBytes,
      sentAt: new Date(sentMs),
      completedAt: new Date(completedMs),
      durationMs,
      tlsIntercepted: false,
    },
    payload: {
      requestId: log.id,
      requestHeaders,
      responseHeaders,
      requestBody: requestBody.text,
      responseBody: responseBody.text,
      requestBodyEncoding: requestBody.encoding,
      responseBodyEncoding: responseBody.encoding,
      requestBodyTruncated: requestBody.truncated,
      responseBodyTruncated: responseBody.truncated,
      contentType,
    },
  };
}

/**
 * protobufjs does not validate UTF-8, so a worker string can hold a lone
 * surrogate; one such value would fail the whole batch's insert.
 */
function str(value: unknown): string {
  return typeof value === 'string' ? wellFormed(value) : '';
}

function wellFormed(value: string): string {
  return value.replace(LONE_SURROGATE, '\uFFFD');
}

/**
 * Postgres text and jsonb both refuse U+0000, and a cut by UTF-16 units can
 * split a surrogate pair.
 */
function cut(value: string, max: number): string {
  return wellFormed(value.replaceAll('\0', '').slice(0, max));
}

function byteCount(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : str(value);
  if (!UINT.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

function timestampMs(ts: ProtoTimestamp | null | undefined): number | null {
  if (!ts) return null;
  const seconds = typeof ts.seconds === 'number' ? String(ts.seconds) : str(ts.seconds);
  if (!INT.test(seconds)) return null;
  const nanos = ts.nanos ?? 0;
  if (!Number.isInteger(nanos) || nanos < 0 || nanos >= 1e9) return null;
  const ms = Number(seconds) * 1000 + Math.floor(nanos / 1e6);
  return Number.isSafeInteger(ms) ? ms : null;
}

function headers(
  list: { name: string; value: string }[] | null | undefined,
): HttpHeaderPair[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((h): HttpHeaderPair => [
      cut(str(h?.name), MAX_HEADER_NAME),
      cut(str(h?.value), MAX_HEADER_VALUE),
    ])
    .filter(([name]) => name.length > 0)
    .slice(0, MAX_HEADERS);
}

function body(
  raw: Buffer | null | undefined,
  truncatedByWorker: boolean,
): { text: string | null; encoding: string | null; truncated: boolean } {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.alloc(0);
  const cut = bytes.length > BODY_CAP;
  const kept = cut ? bytes.subarray(0, BODY_CAP) : bytes;
  const truncated = Boolean(truncatedByWorker) || cut;
  if (!kept.length) return { text: null, encoding: null, truncated };

  const text = decodeText(kept, truncated);
  return text === null
    ? { text: kept.toString('base64'), encoding: 'base64', truncated }
    : { text, encoding: 'utf8', truncated };
}

/**
 * A cut can split a multi-byte character; dropping up to three trailing
 * bytes keeps such a body readable instead of falling back to base64.
 */
function decodeText(bytes: Buffer, truncated: boolean): string | null {
  if (bytes.includes(0)) return null;
  const maxTrim = truncated ? Math.min(3, bytes.length - 1) : 0;
  for (let trim = 0; trim <= maxTrim; trim++) {
    try {
      return utf8.decode(bytes.subarray(0, bytes.length - trim));
    } catch {
      continue;
    }
  }
  return null;
}
