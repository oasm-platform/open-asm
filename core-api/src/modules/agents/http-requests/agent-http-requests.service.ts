import { InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository, SelectQueryBuilder } from 'typeorm';

import { AgentMessageToolCall } from '../entities/tool-call.entity';
import { AgentHttpRequestPayload } from './agent-http-request-payload.entity';
import { AgentHttpRequest } from './agent-http-request.entity';
import type { AgentHttpOutcome } from './agent-http-request.enums';
import { OUTCOME_NAMES, toListItem } from './agent-http-request.mapper';
import {
  AgentHttpOutcomeName,
  AgentHttpRequestDetailDto,
  AgentHttpRequestListResponseDto,
  AgentHttpRequestPayloadDto,
  GetAgentHttpRequestsQueryDto,
} from './dto/agent-http-request.dto';

const OUTCOME_VALUES = Object.fromEntries(
  Object.entries(OUTCOME_NAMES).map(([value, name]) => [name, Number(value)]),
) as Record<AgentHttpOutcomeName, AgentHttpOutcome>;

/**
 * Keyset cursor = base64url(`sentAt` ISO + '|' + `id`), the sort key of the
 * list. A JS Date is exact here: ingest stores `sentAt` from milliseconds.
 */
const SEPARATOR = '|';
/** Strict unpadded base64url; Node's decoder silently skips invalid chars. */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const ISO_MS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AgentHttpCursor {
  sentAt: string;
  id: string;
}

export function encodeAgentHttpCursor(row: Pick<AgentHttpRequest, 'sentAt' | 'id'>): string {
  return Buffer.from(
    `${row.sentAt.toISOString()}${SEPARATOR}${row.id}`,
    'utf8',
  ).toString('base64url');
}

export function decodeAgentHttpCursor(cursor: string): AgentHttpCursor {
  if (!BASE64URL_RE.test(cursor)) throw new InvalidInputError('Invalid cursor');
  const parts = Buffer.from(cursor, 'base64url').toString('utf8').split(SEPARATOR);
  if (parts.length !== 2) throw new InvalidInputError('Invalid cursor');
  const [sentAt, id] = parts;
  if (!ISO_MS_RE.test(sentAt) || !UUID_RE.test(id)) {
    throw new InvalidInputError('Invalid cursor');
  }
  // Shape alone lets '2026-13-45…' through, which Postgres would answer with a 500.
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== sentAt) {
    throw new InvalidInputError('Invalid cursor');
  }
  return { sentAt, id };
}

/** LIKE treats `%`, `_` and `\` as syntax; a host prefix is literal text. */
function likePrefix(value: string): string {
  return `${value.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function toPayload(p: AgentHttpRequestPayload): AgentHttpRequestPayloadDto {
  const headers = (pairs: [string, string][] | null) =>
    (pairs ?? []).map(([name, value]) => ({ name, value }));
  return {
    requestHeaders: headers(p.requestHeaders),
    responseHeaders: headers(p.responseHeaders),
    requestBody: p.requestBody,
    responseBody: p.responseBody,
    requestBodyEncoding: p.requestBodyEncoding,
    responseBodyEncoding: p.responseBodyEncoding,
    requestBodyTruncated: p.requestBodyTruncated,
    responseBodyTruncated: p.responseBodyTruncated,
    contentType: p.contentType,
  };
}

/** Reads the HTTP requests agent shell commands made; rows are private to their creator. */
@Injectable()
export class AgentHttpRequestsService {
  constructor(
    @InjectRepository(AgentHttpRequest)
    private readonly requests: Repository<AgentHttpRequest>,
    @InjectRepository(AgentHttpRequestPayload)
    private readonly payloads: Repository<AgentHttpRequestPayload>,
    @InjectRepository(AgentMessageToolCall)
    private readonly toolCalls: Repository<AgentMessageToolCall>,
  ) {}

  async list(
    workspaceId: string,
    userId: string,
    q: GetAgentHttpRequestsQueryDto,
  ): Promise<AgentHttpRequestListResponseDto> {
    const cursor = q.cursor ? decodeAgentHttpCursor(q.cursor) : null;
    const limit = q.limit ?? 50;
    const qb = this.ownedQuery(workspaceId, userId);

    if (q.conversationId) {
      qb.andWhere('r.conversationId = :conversationId', { conversationId: q.conversationId });
    }
    if (q.runId) qb.andWhere('r.runId = :runId', { runId: q.runId });
    if (q.agentName) qb.andWhere('r.agentName = :agentName', { agentName: q.agentName });
    if (q.subagentId) qb.andWhere('r.subagentId = :subagentId', { subagentId: q.subagentId });
    if (q.host) qb.andWhere("r.host LIKE :host ESCAPE '\\'", { host: likePrefix(q.host) });
    if (q.method) qb.andWhere('r.method = :method', { method: q.method.toUpperCase() });
    if (q.statusClass) {
      const lo = Number(q.statusClass[0]) * 100;
      qb.andWhere('r.statusCode BETWEEN :statusLo AND :statusHi', {
        statusLo: lo,
        statusHi: lo + 99,
      });
    }
    if (q.outcome) qb.andWhere('r.outcome = :outcome', { outcome: OUTCOME_VALUES[q.outcome] });
    // Same predicate as the partial index IDX_agent_http_problems.
    if (q.errorsOnly) qb.andWhere('(r.outcome <> 0 OR r.statusCode >= 400)');
    if (q.from) qb.andWhere('r.sentAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('r.sentAt <= :to', { to: q.to });
    if (cursor) {
      qb.andWhere(
        '(r.sentAt, r.id) < (CAST(:cursorSentAt AS timestamptz), CAST(:cursorId AS uuid))',
        { cursorSentAt: cursor.sentAt, cursorId: cursor.id },
      );
    }

    const rows = await qb
      .orderBy('r.sentAt', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .limit(limit + 1)
      .getMany();
    const page = rows.slice(0, limit);
    return {
      data: page.map((row) => toListItem(row, row.conversation?.title ?? null)),
      nextCursor:
        rows.length > limit ? encodeAgentHttpCursor(page[page.length - 1]) : null,
    };
  }

  async get(workspaceId: string, userId: string, id: string): Promise<AgentHttpRequestDetailDto> {
    const row = await this.ownedQuery(workspaceId, userId)
      .andWhere('r.id = :id', { id })
      .getOne();
    if (!row) throw new NotFoundError('HTTP request not found');

    const [payload, toolCall] = await Promise.all([
      this.payloads.findOne({ where: { requestId: row.id } }),
      row.toolCallId
        ? this.toolCalls.findOne({
            where: { conversationId: row.conversationId, toolCallId: row.toolCallId },
            select: { messageId: true, args: true },
          })
        : null,
    ]);
    const command = toolCall?.args?.command;
    return {
      ...toListItem(row, row.conversation?.title ?? null),
      payload: payload ? toPayload(payload) : null,
      command: typeof command === 'string' ? command : null,
      messageId: toolCall?.messageId ?? null,
    };
  }

  private ownedQuery(workspaceId: string, userId: string): SelectQueryBuilder<AgentHttpRequest> {
    return this.requests
      .createQueryBuilder('r')
      .leftJoin('r.conversation', 'c')
      .addSelect(['c.id', 'c.title'])
      .where('r.workspaceId = :workspaceId', { workspaceId })
      .andWhere('r.createdBy = :userId', { userId });
  }
}
