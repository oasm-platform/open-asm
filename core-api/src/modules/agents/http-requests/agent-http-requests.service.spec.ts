import { InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';
import type { Repository } from 'typeorm';

import type { AgentMessageToolCall } from '../entities/tool-call.entity';
import type { AgentHttpRequestPayload } from './agent-http-request-payload.entity';
import type { AgentHttpRequest } from './agent-http-request.entity';
import { AgentHttpOutcome } from './agent-http-request.enums';
import {
  AgentHttpRequestsService,
  decodeAgentHttpCursor,
  encodeAgentHttpCursor,
} from './agent-http-requests.service';
import { GetAgentHttpRequestsQueryDto } from './dto/agent-http-request.dto';

const ID = '0192f0a8-7a3b-7c1d-8e2f-1a2b3c4d5e6f';
const CONV = '11111111-1111-4111-8111-111111111111';

function row(overrides: Partial<AgentHttpRequest> = {}): AgentHttpRequest {
  return {
    id: ID,
    conversationId: CONV,
    conversation: { id: CONV, title: 'Recon' },
    workspaceId: 'w1',
    createdBy: 'u1',
    toolCallId: 'call_1',
    runId: 'run-1',
    subagentId: null,
    agentName: 'main',
    workerId: null,
    scheme: 'https',
    method: 'GET',
    host: 'example.com',
    port: 443,
    path: '/',
    statusCode: 200,
    outcome: AgentHttpOutcome.ALLOWED,
    error: null,
    requestBytes: 10,
    responseBytes: 20,
    sentAt: new Date('2026-11-27T10:00:00.123Z'),
    completedAt: new Date('2026-11-27T10:00:00.223Z'),
    durationMs: 100,
    tlsIntercepted: true,
    createdAt: new Date('2026-11-27T10:00:01.000Z'),
    ...overrides,
  } as AgentHttpRequest;
}

type Where = [string, Record<string, unknown> | undefined];

interface FakeQb {
  wheres: Where[];
  leftJoin: jest.Mock<FakeQb>;
  addSelect: jest.Mock<FakeQb>;
  where: jest.Mock<FakeQb, [string, Record<string, unknown>?]>;
  andWhere: jest.Mock<FakeQb, [string, Record<string, unknown>?]>;
  orderBy: jest.Mock<FakeQb>;
  addOrderBy: jest.Mock<FakeQb>;
  limit: jest.Mock<FakeQb>;
  getMany: jest.Mock<Promise<AgentHttpRequest[]>>;
  getOne: jest.Mock<Promise<AgentHttpRequest | null>>;
}

/** A chainable query builder that records every where clause. */
function fakeQb(result: { many?: AgentHttpRequest[]; one?: AgentHttpRequest | null }): FakeQb {
  const wheres: Where[] = [];
  const qb: FakeQb = {
    wheres,
    leftJoin: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn((sql: string, p?: Record<string, unknown>) => {
      wheres.push([sql, p]);
      return qb;
    }),
    andWhere: jest.fn((sql: string, p?: Record<string, unknown>) => {
      wheres.push([sql, p]);
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getMany: jest.fn(() => Promise.resolve(result.many ?? [])),
    getOne: jest.fn(() => Promise.resolve(result.one ?? null)),
  };
  return qb;
}

function build(result: { many?: AgentHttpRequest[]; one?: AgentHttpRequest | null }) {
  const qb = fakeQb(result);
  const requests = { createQueryBuilder: jest.fn(() => qb) };
  const payloads = { findOne: jest.fn() };
  const toolCalls = { findOne: jest.fn() };
  const service = new AgentHttpRequestsService(
    requests as unknown as Repository<AgentHttpRequest>,
    payloads as unknown as Repository<AgentHttpRequestPayload>,
    toolCalls as unknown as Repository<AgentMessageToolCall>,
  );
  return { service, qb, payloads, toolCalls };
}

const query = (q: Partial<GetAgentHttpRequestsQueryDto>) =>
  Object.assign(new GetAgentHttpRequestsQueryDto(), q);

const params = (wheres: Array<[string, Record<string, unknown> | undefined]>) =>
  Object.assign({}, ...wheres.map(([, p]) => p ?? {})) as Record<string, unknown>;

describe('agent HTTP cursor', () => {
  it('round-trips sentAt and id', () => {
    const cursor = encodeAgentHttpCursor(row());
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeAgentHttpCursor(cursor)).toEqual({
      sentAt: '2026-11-27T10:00:00.123Z',
      id: ID,
    });
  });

  it.each([
    ['not base64url', '***'],
    ['no separator', Buffer.from('abc').toString('base64url')],
    ['bad id', Buffer.from('2026-11-27T10:00:00.123Z|nope').toString('base64url')],
    ['bad date', Buffer.from(`2026-13-45T10:00:00.123Z|${ID}`).toString('base64url')],
  ])('rejects %s', (_name, cursor) => {
    expect(() => decodeAgentHttpCursor(cursor)).toThrow(InvalidInputError);
  });
});

describe('AgentHttpRequestsService.list', () => {
  it('always scopes to the caller in the workspace', async () => {
    const { service, qb } = build({ many: [] });
    await service.list('w1', 'u1', query({}));
    expect(qb.wheres[0][0]).toBe('r.workspaceId = :workspaceId');
    expect(qb.wheres[1][0]).toBe('r.createdBy = :userId');
    expect(params(qb.wheres)).toMatchObject({ workspaceId: 'w1', userId: 'u1' });
    expect(qb.limit).toHaveBeenCalledWith(51);
    expect(qb.orderBy).toHaveBeenCalledWith('r.sentAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('r.id', 'DESC');
  });

  it('turns every filter into a where clause', async () => {
    const { service, qb } = build({ many: [] });
    await service.list(
      'w1',
      'u1',
      query({
        conversationId: CONV,
        runId: 'run-1',
        agentName: 'recon',
        subagentId: CONV,
        host: 'API.Ex_a%',
        method: 'post',
        statusClass: '4xx',
        outcome: 'upstream_error',
        errorsOnly: true,
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-30T00:00:00Z',
      }),
    );
    const sqls = qb.wheres.map(([s]) => s);
    expect(sqls).toEqual(
      expect.arrayContaining([
        'r.conversationId = :conversationId',
        'r.runId = :runId',
        'r.agentName = :agentName',
        'r.subagentId = :subagentId',
        "r.host LIKE :host ESCAPE '\\'",
        'r.method = :method',
        'r.statusCode BETWEEN :statusLo AND :statusHi',
        'r.outcome = :outcome',
        '(r.outcome <> 0 OR r.statusCode >= 400)',
        'r.sentAt >= :from',
        'r.sentAt <= :to',
      ]),
    );
    expect(params(qb.wheres)).toMatchObject({
      host: 'api.ex\\_a\\%%',
      method: 'POST',
      statusLo: 400,
      statusHi: 499,
      outcome: AgentHttpOutcome.UPSTREAM_ERROR,
    });
  });

  it('pages with limit + 1 and a cursor from the last row shown', async () => {
    const newer = row({ id: '0192f0a8-7a3b-7c1d-8e2f-000000000002' });
    const older = row({ sentAt: new Date('2026-11-27T09:00:00.000Z') });
    const extra = row({ id: '0192f0a8-7a3b-7c1d-8e2f-000000000003' });
    const { service } = build({ many: [newer, older, extra] });

    const page = await service.list('w1', 'u1', query({ limit: 2 }));

    expect(page.data.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(page.nextCursor).toBe(encodeAgentHttpCursor(older));
    expect(page.data[0]).toMatchObject({ conversationTitle: 'Recon', outcome: 'allowed' });
    expect(page.data[0]).not.toHaveProperty('workspaceId');
    expect(page.data[0]).not.toHaveProperty('createdBy');
    expect(page.data[0]).not.toHaveProperty('conversation');
  });

  it('has no next cursor on the last page', async () => {
    const { service } = build({ many: [row()] });
    const page = await service.list('w1', 'u1', query({ limit: 2 }));
    expect(page.nextCursor).toBeNull();
  });

  it('continues after the cursor row', async () => {
    const { service, qb } = build({ many: [] });
    await service.list('w1', 'u1', query({ cursor: encodeAgentHttpCursor(row()) }));
    const clause = qb.wheres.find(([s]) => s.includes(':cursorId'));
    expect(clause?.[0]).toBe(
      '(r.sentAt, r.id) < (CAST(:cursorSentAt AS timestamptz), CAST(:cursorId AS uuid))',
    );
    expect(clause?.[1]).toEqual({
      cursorSentAt: '2026-11-27T10:00:00.123Z',
      cursorId: ID,
    });
  });

  it('rejects an invalid cursor before querying', async () => {
    const { service, qb } = build({ many: [] });
    await expect(
      service.list('w1', 'u1', query({ cursor: 'garbage!' })),
    ).rejects.toThrow(InvalidInputError);
    expect(qb.getMany).not.toHaveBeenCalled();
  });
});

describe('AgentHttpRequestsService.get', () => {
  it("is a 404 for a row that is not the caller's", async () => {
    const { service, qb, payloads } = build({ one: null });
    await expect(service.get('w1', 'u2', ID)).rejects.toThrow(NotFoundError);
    expect(qb.wheres.map(([s]) => s)).toEqual([
      'r.workspaceId = :workspaceId',
      'r.createdBy = :userId',
      'r.id = :id',
    ]);
    expect(params(qb.wheres)).toMatchObject({ id: ID, workspaceId: 'w1', userId: 'u2' });
    expect(payloads.findOne).not.toHaveBeenCalled();
  });

  it('adds the payload, the command and its message', async () => {
    const { service, payloads, toolCalls } = build({ one: row() });
    payloads.findOne.mockResolvedValue({
      requestId: ID,
      requestHeaders: [['Accept', '*/*'], ['Authorization', '***']],
      responseHeaders: null,
      requestBody: null,
      responseBody: 'aGk=',
      requestBodyEncoding: null,
      responseBodyEncoding: 'base64',
      requestBodyTruncated: false,
      responseBodyTruncated: true,
      contentType: 'application/octet-stream',
    });
    toolCalls.findOne.mockResolvedValue({
      messageId: 'm1',
      args: { command: 'curl https://example.com' },
    });

    const detail = await service.get('w1', 'u1', ID);

    expect(toolCalls.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: CONV, toolCallId: 'call_1' } }),
    );
    expect(detail).toMatchObject({
      id: ID,
      conversationTitle: 'Recon',
      command: 'curl https://example.com',
      messageId: 'm1',
      payload: {
        requestHeaders: [
          { name: 'Accept', value: '*/*' },
          { name: 'Authorization', value: '***' },
        ],
        responseHeaders: [],
        responseBody: 'aGk=',
        responseBodyEncoding: 'base64',
        responseBodyTruncated: true,
        contentType: 'application/octet-stream',
      },
    });
    expect(detail.payload).not.toHaveProperty('requestId');
  });

  it('leaves command and message null without a tool call', async () => {
    const { service, payloads, toolCalls } = build({ one: row({ toolCallId: null }) });
    payloads.findOne.mockResolvedValue(null);
    const detail = await service.get('w1', 'u1', ID);
    expect(toolCalls.findOne).not.toHaveBeenCalled();
    expect(detail).toMatchObject({ payload: null, command: null, messageId: null });
  });
});
