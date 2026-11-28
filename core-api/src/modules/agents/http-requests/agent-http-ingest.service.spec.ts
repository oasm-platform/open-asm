import { AuditActorType, AuditOutcome } from '@/common/enums/enum';
import { EVENT_CATALOG } from '@/modules/event-bridge/contracts/event-catalog';
import type { EventBridgeService } from '@/modules/event-bridge/publishing/event-bridge.service';
import type { RedisService } from '@/services/redis/redis.service';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  AgentHttpIngestService,
  type EgressHttpLogInput,
} from './agent-http-ingest.service';
import { AgentHttpRequestPayload } from './agent-http-request-payload.entity';
import { AgentHttpRequest } from './agent-http-request.entity';
import { AgentHttpOutcome } from './agent-http-request.enums';
import type { HttpLogSession } from './http-log-session';

const WORKER = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKER = '22222222-2222-4222-8222-222222222222';
const CONV = '33333333-3333-4333-8333-333333333333';
const WS = '44444444-4444-4444-8444-444444444444';
const USER = '55555555-5555-4555-8555-555555555555';
const SUB = '66666666-6666-4666-8666-666666666666';

const session = (over: Partial<HttpLogSession> = {}): HttpLogSession => ({
  workspaceId: WS,
  conversationId: CONV,
  createdBy: USER,
  toolCallId: 'call-1',
  subagentId: SUB,
  agentName: 'recon',
  workerId: WORKER,
  ...over,
});

let seq = 0;
const nextId = () =>
  `0190a000-0000-7000-8000-${String(++seq).padStart(12, '0')}`;

const SENT_S = Math.floor(Date.now() / 1000) - 60;
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

const log = (over: Partial<EgressHttpLogInput> = {}): EgressHttpLogInput => ({
  id: nextId(),
  sessionId: 'sess-1',
  scheme: 'https',
  method: 'GET',
  host: 'Example.COM',
  port: 443,
  path: '/a?b=1',
  statusCode: 200,
  outcome: 'EGRESS_HTTP_OUTCOME_ALLOWED',
  error: '',
  requestBytes: '10',
  responseBytes: '20',
  sentAt: { seconds: String(SENT_S), nanos: 0 },
  completedAt: { seconds: String(SENT_S), nanos: 250_000_000 },
  requestHeaders: [{ name: 'Accept', value: '*/*' }],
  responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
  requestBody: Buffer.alloc(0),
  responseBody: Buffer.from('hello'),
  requestBodyTruncated: false,
  responseBodyTruncated: false,
  ...over,
});

interface Harness {
  service: AgentHttpIngestService;
  inserted: { entity: unknown; values: Record<string, unknown>[] }[];
  query: jest.Mock;
  mget: jest.Mock;
  transaction: jest.Mock;
  publish: jest.Mock;
  publishSafely: jest.Mock;
}

/**
 * `existing` ids are already stored: the request insert does not return them,
 * like `ON CONFLICT DO NOTHING ... RETURNING id`.
 */
function setup(opts: {
  sessions?: Record<string, unknown>;
  conversations?: string[];
  existing?: string[];
  publish?: jest.Mock;
  publishSafely?: jest.Mock;
} = {}): Harness {
  const sessions = opts.sessions ?? { 'sess-1': session() };
  const conversations = opts.conversations ?? [CONV];
  const existing = new Set(opts.existing ?? []);
  const inserted: Harness['inserted'] = [];

  const builder = () => {
    let entity: unknown;
    let values: Record<string, unknown>[] = [];
    const qb = {
      insert: () => qb,
      into: (e: unknown) => ((entity = e), qb),
      values: (v: Record<string, unknown>[]) => ((values = v), qb),
      orIgnore: () => qb,
      returning: () => qb,
      execute: jest.fn(() => {
        inserted.push({ entity, values });
        const fresh =
          entity === AgentHttpRequest
            ? values.filter((v) => !existing.has(v.id as string))
            : [];
        return Promise.resolve({
          raw: fresh.map((v) => ({ id: v.id, createdAt: CREATED_AT })),
        });
      }),
    };
    return qb;
  };
  const manager = { createQueryBuilder: jest.fn(builder) };
  const transaction = jest.fn((cb: (m: unknown) => Promise<unknown>) =>
    cb(manager),
  );
  const query = jest.fn((_sql: string, [ids]: [string[]]) =>
    Promise.resolve(
      ids.filter((id) => conversations.includes(id)).map((id) => ({ id })),
    ),
  );
  const mget = jest.fn((keys: string[]) =>
    Promise.resolve(
      keys.map((k) => {
        const id = k.replace('agent:http-log:session:', '');
        return id in sessions ? JSON.stringify(sessions[id]) : null;
      }),
    ),
  );
  const publish = opts.publish ?? jest.fn(() => Promise.resolve(1));
  const publishSafely =
    opts.publishSafely ?? jest.fn(() => Promise.resolve('evt-1'));
  const service = new AgentHttpIngestService(
    { query, transaction } as unknown as DataSource,
    { cacheClient: { mget }, publish } as unknown as RedisService,
    { publishSafely } as unknown as EventBridgeService,
  );
  return { service, inserted, query, mget, transaction, publish, publishSafely };
}

const rowsOf = (h: Harness, entity: unknown) =>
  h.inserted.filter((i) => i.entity === entity).flatMap((i) => i.values);

const published = (h: Harness) =>
  h.publish.mock.calls.map(([channel, message]: [string, string]) => ({
    channel,
    body: JSON.parse(message) as {
      requests?: Record<string, unknown>[];
      refetch?: boolean;
    },
  }));

describe('AgentHttpIngestService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid event and maps every column from the event and session', async () => {
    const h = setup();
    const event = log();

    const result = await h.service.ingest(WORKER, [event], 0);

    expect(result).toEqual({ accepted: 1, rejected: 0 });
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(rowsOf(h, AgentHttpRequest)).toEqual([
      {
        id: event.id,
        conversationId: CONV,
        workspaceId: WS,
        createdBy: USER,
        toolCallId: 'call-1',
        runId: 'sess-1',
        subagentId: SUB,
        agentName: 'recon',
        workerId: WORKER,
        scheme: 'https',
        method: 'GET',
        host: 'example.com',
        port: 443,
        path: '/a?b=1',
        statusCode: 200,
        outcome: AgentHttpOutcome.ALLOWED,
        error: null,
        requestBytes: 10,
        responseBytes: 20,
        sentAt: new Date(SENT_S * 1000),
        completedAt: new Date(SENT_S * 1000 + 250),
        durationMs: 250,
        tlsIntercepted: false,
      },
    ]);
    expect(rowsOf(h, AgentHttpRequestPayload)).toEqual([
      {
        requestId: event.id,
        requestHeaders: [['Accept', '*/*']],
        responseHeaders: [['Content-Type', 'text/html']],
        requestBody: null,
        responseBody: 'hello',
        requestBodyEncoding: null,
        responseBodyEncoding: 'utf8',
        requestBodyTruncated: false,
        responseBodyTruncated: false,
        contentType: 'text/html',
      },
    ]);
  });

  it('maps a CONNECT tunnel with no status to null method, path and status', async () => {
    const h = setup();
    await h.service.ingest(
      WORKER,
      [
        log({
          method: '',
          path: '',
          statusCode: 0,
          outcome: 'EGRESS_HTTP_OUTCOME_UPSTREAM_ERROR',
          error: 'x'.repeat(600),
        }),
      ],
      0,
    );
    const [row] = rowsOf(h, AgentHttpRequest);
    expect(row).toMatchObject({
      method: null,
      path: null,
      statusCode: null,
      outcome: AgentHttpOutcome.UPSTREAM_ERROR,
    });
    expect(row.error).toHaveLength(500);
  });

  it('rejects an event whose session is unknown, without failing the batch', async () => {
    const h = setup();
    const result = await h.service.ingest(
      WORKER,
      [log({ sessionId: 'gone' }), log()],
      0,
    );
    expect(result).toEqual({ accepted: 1, rejected: 1 });
    expect(rowsOf(h, AgentHttpRequest)).toHaveLength(1);
  });

  it('rejects an event from a session that belongs to another worker', async () => {
    const h = setup({ sessions: { 'sess-1': session({ workerId: OTHER_WORKER }) } });
    const result = await h.service.ingest(WORKER, [log()], 0);
    expect(result).toEqual({ accepted: 0, rejected: 1 });
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('treats a session with missing or malformed fields as unknown', async () => {
    const h = setup({
      sessions: {
        a: { ...session(), workspaceId: '' },
        b: { ...session(), conversationId: 42 },
        c: { workerId: WORKER },
      },
    });
    const result = await h.service.ingest(
      WORKER,
      [log({ sessionId: 'a' }), log({ sessionId: 'b' }), log({ sessionId: 'c' })],
      0,
    );
    expect(result).toEqual({ accepted: 0, rejected: 3 });
  });

  it('rejects completedAt before sentAt, a future sentAt and a missing sentAt', async () => {
    const h = setup();
    const futureS = Math.floor(Date.now() / 1000) + 6 * 60;
    const result = await h.service.ingest(
      WORKER,
      [
        log({ completedAt: { seconds: String(SENT_S - 1), nanos: 0 } }),
        log({
          sentAt: { seconds: String(futureS), nanos: 0 },
          completedAt: { seconds: String(futureS + 1), nanos: 0 },
        }),
        log({ sentAt: undefined }),
        log({ completedAt: null }),
      ],
      0,
    );
    expect(result).toEqual({ accepted: 0, rejected: 4 });
  });

  it('rejects a sentAt older than an hour, a year-0001 sentAt and out-of-range nanos', async () => {
    const h = setup();
    const oldS = SENT_S - 2 * 60 * 60;
    const result = await h.service.ingest(
      WORKER,
      [
        log({
          sentAt: { seconds: String(oldS), nanos: 0 },
          completedAt: { seconds: String(oldS + 1), nanos: 0 },
        }),
        log({
          sentAt: { seconds: '-62135596800', nanos: 0 },
          completedAt: { seconds: '-62135596800', nanos: 0 },
        }),
        log({ sentAt: { seconds: String(SENT_S), nanos: 1e9 } }),
        log({ sentAt: { seconds: String(SENT_S), nanos: -1 } }),
        log({ completedAt: { seconds: String(SENT_S + 1), nanos: 1.5 } }),
      ],
      0,
    );
    expect(result).toEqual({ accepted: 0, rejected: 5 });
  });

  it('keeps stored strings well-formed when a cut splits a surrogate pair or the worker sends a lone one', async () => {
    const h = setup();
    const straddling = 'v'.repeat(8191) + '😀';
    const lone = 'bad\ud83dvalue';
    const result = await h.service.ingest(
      WORKER,
      [
        log({
          requestHeaders: [{ name: 'X-Emoji', value: straddling }],
          responseHeaders: [{ name: 'Content-Type', value: lone }],
          error: lone,
          path: `/p${lone}`,
        }),
      ],
      0,
    );
    expect(result).toEqual({ accepted: 1, rejected: 0 });
    const [row] = rowsOf(h, AgentHttpRequest);
    const [payload] = rowsOf(h, AgentHttpRequestPayload);
    const wellFormed = (v: unknown) =>
      !/[\uD800-\uDFFF]/.test(String(v).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''));
    const reqHeaders = payload.requestHeaders as [string, string][];
    expect(reqHeaders[0][1]).toHaveLength(8192);
    expect(wellFormed(reqHeaders[0][1])).toBe(true);
    expect(wellFormed((payload.responseHeaders as [string, string][])[0][1])).toBe(true);
    expect(wellFormed(payload.contentType)).toBe(true);
    expect(wellFormed(row.error)).toBe(true);
    expect(wellFormed(row.path)).toBe(true);
    expect(row.error).toBe('bad\uFFFDvalue');
  });

  it('drops headers with an empty name', async () => {
    const h = setup();
    await h.service.ingest(
      WORKER,
      [log({ requestHeaders: [{ name: '', value: 'x' }, { name: 'A', value: 'b' }] })],
      0,
    );
    const [payload] = rowsOf(h, AgentHttpRequestPayload);
    expect(payload.requestHeaders).toEqual([['A', 'b']]);
  });

  it('keeps a leading BOM in a UTF-8 body', async () => {
    const h = setup();
    await h.service.ingest(
      WORKER,
      [log({ responseBody: Buffer.from('\uFEFFhi') })],
      0,
    );
    const [payload] = rowsOf(h, AgentHttpRequestPayload);
    expect(payload.responseBody).toBe('\uFEFFhi');
  });

  it('rejects invalid fields event by event', async () => {
    const h = setup();
    const bad: Partial<EgressHttpLogInput>[] = [
      { id: 'not-a-uuid' },
      { host: '' },
      { host: 'h'.repeat(256) },
      { port: 0 },
      { port: 65536 },
      { method: 'get' },
      { method: 'X'.repeat(17) },
      { path: '/'.repeat(8193) },
      { scheme: 'ftp' },
      { outcome: 'EGRESS_HTTP_OUTCOME_UNSPECIFIED' },
      { outcome: 'NOPE' },
      { statusCode: 99 },
      { statusCode: 600 },
      { requestBytes: '-1' },
      { responseBytes: 'abc' },
    ];
    const result = await h.service.ingest(
      WORKER,
      [...bad.map((b) => log(b)), log()],
      0,
    );
    expect(result).toEqual({ accepted: 1, rejected: bad.length });
  });

  it('caps headers per side, cuts long names and values', async () => {
    const h = setup();
    const many = Array.from({ length: 120 }, (_, i) => ({
      name: `h${i}`,
      value: 'v',
    }));
    await h.service.ingest(
      WORKER,
      [
        log({
          requestHeaders: [
            { name: 'n'.repeat(300), value: 'v'.repeat(9000) },
            ...many,
          ],
        }),
      ],
      0,
    );
    const [payload] = rowsOf(h, AgentHttpRequestPayload);
    const headers = payload.requestHeaders as [string, string][];
    expect(headers).toHaveLength(100);
    expect(headers[0][0]).toHaveLength(256);
    expect(headers[0][1]).toHaveLength(8192);
  });

  it('cuts a body over 64 KiB and forces the truncated flag', async () => {
    const h = setup();
    await h.service.ingest(
      WORKER,
      [
        log({
          responseBody: Buffer.alloc(64 * 1024 + 10, 'a'),
          requestBody: Buffer.alloc(64 * 1024, 'b'),
        }),
      ],
      0,
    );
    const [payload] = rowsOf(h, AgentHttpRequestPayload);
    expect(payload.responseBody).toHaveLength(64 * 1024);
    expect(payload.responseBodyTruncated).toBe(true);
    // Exactly at the cap is not cut.
    expect(payload.requestBody).toHaveLength(64 * 1024);
    expect(payload.requestBodyTruncated).toBe(false);
  });

  it('stores a binary or NUL-containing body as base64', async () => {
    const h = setup();
    const binary = Buffer.from([0xff, 0xfe, 0x00, 0x01]);
    const withNul = Buffer.from('a\u0000b');
    await h.service.ingest(
      WORKER,
      [log({ responseBody: binary, requestBody: withNul })],
      0,
    );
    const [payload] = rowsOf(h, AgentHttpRequestPayload);
    expect(payload).toMatchObject({
      responseBody: binary.toString('base64'),
      responseBodyEncoding: 'base64',
      requestBody: withNul.toString('base64'),
      requestBodyEncoding: 'base64',
    });
  });

  it('keeps a cut UTF-8 body as text when the cut splits a character', async () => {
    const h = setup();
    // '€' is 3 bytes, so the 64 KiB cut lands inside one.
    const body = Buffer.from('€'.repeat(30_000));
    await h.service.ingest(WORKER, [log({ responseBody: body })], 0);
    const [payload] = rowsOf(h, AgentHttpRequestPayload);
    expect(payload.responseBodyEncoding).toBe('utf8');
    expect(payload.responseBodyTruncated).toBe(true);
  });

  it('drops events whose conversation was deleted, with one lookup', async () => {
    const h = setup({ conversations: [] });
    const result = await h.service.ingest(WORKER, [log(), log()], 0);
    expect(result).toEqual({ accepted: 0, rejected: 2 });
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.query.mock.calls[0][0]).toContain('ANY($1)');
    expect(h.query.mock.calls[0][1]).toEqual([[CONV]]);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('counts a duplicate id as accepted without inserting its payload again', async () => {
    const dup = log();
    const fresh = log();
    const h = setup({ existing: [dup.id] });
    const result = await h.service.ingest(WORKER, [dup, fresh], 0);
    expect(result).toEqual({ accepted: 2, rejected: 0 });
    expect(rowsOf(h, AgentHttpRequest)).toHaveLength(2);
    expect(
      rowsOf(h, AgentHttpRequestPayload).map((p) => p.requestId),
    ).toEqual([fresh.id]);
  });

  it('inserts an id repeated inside one batch once', async () => {
    const h = setup();
    const event = log();
    const result = await h.service.ingest(WORKER, [event, { ...event }], 0);
    expect(result).toEqual({ accepted: 2, rejected: 0 });
    expect(rowsOf(h, AgentHttpRequest)).toHaveLength(1);
  });

  it('warns with the worker id when the worker dropped events', async () => {
    const h = setup();
    await h.service.ingest(WORKER, [], 7);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining(WORKER),
    );
    expect(h.mget).not.toHaveBeenCalled();
  });

  describe('realtime push', () => {
    const CONV_B = '77777777-7777-4777-8777-777777777777';

    it('publishes the newly inserted rows once per conversation, in list-item shape', async () => {
      const h = setup({
        sessions: {
          'sess-1': session(),
          'sess-2': session({ conversationId: CONV_B }),
        },
        conversations: [CONV, CONV_B],
      });
      const a1 = log();
      const a2 = log();
      const b1 = log({ sessionId: 'sess-2' });

      await h.service.ingest(WORKER, [a1, b1, a2], 0);

      const msgs = published(h);
      expect(msgs.map((m) => m.channel).sort()).toEqual(
        [`agent:http-log:chan:${CONV}`, `agent:http-log:chan:${CONV_B}`].sort(),
      );
      const forA = msgs.find((m) => m.channel.endsWith(CONV))!;
      expect(forA.body.requests!.map((r) => r.id)).toEqual([a1.id, a2.id]);
      expect(forA.body.requests![0]).toEqual({
        id: a1.id,
        conversationId: CONV,
        conversationTitle: null,
        toolCallId: 'call-1',
        runId: 'sess-1',
        subagentId: SUB,
        agentName: 'recon',
        workerId: WORKER,
        scheme: 'https',
        method: 'GET',
        host: 'example.com',
        port: 443,
        path: '/a?b=1',
        statusCode: 200,
        outcome: 'allowed',
        error: null,
        requestBytes: 10,
        responseBytes: 20,
        sentAt: new Date(SENT_S * 1000).toISOString(),
        completedAt: new Date(SENT_S * 1000 + 250).toISOString(),
        durationMs: 250,
        tlsIntercepted: false,
        createdAt: CREATED_AT.toISOString(),
      });
    });

    it('does not announce ids that were already stored', async () => {
      const dup = log();
      const fresh = log();
      const h = setup({ existing: [dup.id] });

      await h.service.ingest(WORKER, [dup, fresh], 0);

      const [msg] = published(h);
      expect(h.publish).toHaveBeenCalledTimes(1);
      expect(msg.body.requests!.map((r) => r.id)).toEqual([fresh.id]);
    });

    it('publishes nothing when every id was already stored', async () => {
      const dup = log();
      const h = setup({ existing: [dup.id] });
      await h.service.ingest(WORKER, [dup], 0);
      expect(h.publish).not.toHaveBeenCalled();
    });

    it('asks for a refetch instead of sending more than 200 rows', async () => {
      const h = setup();
      await h.service.ingest(
        WORKER,
        Array.from({ length: 201 }, () => log()),
        0,
      );
      expect(published(h)).toEqual([
        { channel: `agent:http-log:chan:${CONV}`, body: { refetch: true } },
      ]);
    });

    it('still accepts the batch when publishing fails', async () => {
      const h = setup({
        publish: jest.fn(() => Promise.reject(new Error('redis down'))),
      });
      const result = await h.service.ingest(WORKER, [log()], 0);
      expect(result).toEqual({ accepted: 1, rejected: 0 });
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('redis down'),
      );
    });
  });

  describe('event bus announcement', () => {
    const CONV_B = '77777777-7777-4777-8777-777777777777';
    const USER_B = '88888888-8888-4888-8888-888888888888';

    it('publishes one owner-attributed event per conversation with new rows', async () => {
      const h = setup({
        sessions: {
          'sess-1': session(),
          'sess-2': session({ conversationId: CONV_B, createdBy: USER_B }),
        },
        conversations: [CONV, CONV_B],
      });

      await h.service.ingest(
        WORKER,
        [log(), log({ sessionId: 'sess-2' }), log()],
        0,
      );

      expect(h.publishSafely).toHaveBeenCalledTimes(2);
      expect(h.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.agent.http_requests.recorded,
        {
          workspaceId: WS,
          outcome: AuditOutcome.Success,
          actor: { type: AuditActorType.Agent, id: USER },
          resourceType: 'conversation',
          resourceId: CONV,
          metadata: { count: 2 },
        },
      );
      expect(h.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.agent.http_requests.recorded,
        expect.objectContaining({
          actor: { type: AuditActorType.Agent, id: USER_B },
          resourceId: CONV_B,
          metadata: { count: 1 },
        }),
      );
    });

    it('announces nothing for rows that were already stored', async () => {
      const dup = log();
      const h = setup({ existing: [dup.id] });
      await h.service.ingest(WORKER, [dup], 0);
      expect(h.publishSafely).not.toHaveBeenCalled();
    });

    it('pushes to the chat stream without waiting for the bus publish', async () => {
      let release!: () => void;
      const h = setup({
        publishSafely: jest.fn(
          () => new Promise<null>((resolve) => (release = () => resolve(null))),
        ),
      });
      const done = h.service.ingest(WORKER, [log()], 0);
      await new Promise((resolve) => setImmediate(resolve));
      expect(h.publishSafely).toHaveBeenCalledTimes(1);
      expect(h.publish).toHaveBeenCalledTimes(1);
      release();
      await expect(done).resolves.toEqual({ accepted: 1, rejected: 0 });
    });

    it('still publishes on the bus when the chat push fails', async () => {
      const h = setup({
        publish: jest.fn(() => Promise.reject(new Error('redis down'))),
      });
      const result = await h.service.ingest(WORKER, [log()], 0);
      expect(result).toEqual({ accepted: 1, rejected: 0 });
      expect(h.publishSafely).toHaveBeenCalledTimes(1);
    });
  });
});
