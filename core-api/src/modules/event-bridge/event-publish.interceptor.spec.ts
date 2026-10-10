import { AuditOutcome } from '@/common/enums/enum';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import type { EventBridgeService } from './event-bridge.service';
import { EVENT_CATALOG } from '../connectors/event';
import { EventPublishInterceptor } from './event-publish.interceptor';
import type { PublishEventConfig } from './publish-event.decorator';

/**
 * The interceptor is the ONLY place a request becomes an event, so its contract
 * is what keeps the audit trail trustworthy:
 *
 *  - an event with no resolvable workspace is SKIPPED, never written with a
 *    sentinel (that is what lets consumers filter by workspace without decoding
 *    `data`, and what keeps `audit_events.workspace_id` NOT NULL);
 *  - a request with no identity produces no event;
 *  - a failing request still emits, with `outcome: failure`, and the original
 *    error is what reaches the client;
 *  - a buggy extractor skips the event instead of turning a 200 into a 500.
 *
 * Run: task api:test:one SPEC=src/modules/event-bridge/event-publish.interceptor.spec.ts
 */
describe('EventPublishInterceptor', () => {
  const WORKSPACE = '11111111-1111-4111-8111-111111111111';

  let publish: jest.Mock;
  let publishSafely: jest.Mock;
  let reflector: Reflector;
  let interceptor: EventPublishInterceptor;

  const makeRequest = (
    overrides: Partial<RequestWithMetadata> = {},
  ): RequestWithMetadata =>
    ({
      headers: {},
      params: {},
      body: {},
      requestId: 'req-1',
      session: { userId: 'u-1' },
      user: { id: 'u-1', name: 'Alice', email: 'a@example.com' },
      workspaceId: WORKSPACE,
      ...overrides,
    }) as unknown as RequestWithMetadata;

  /** Context carrying `config` as handler metadata; null config ⇒ pass-through. */
  const contextFor = (
    config: (PublishEventConfig & { event: unknown }) | null,
    req: RequestWithMetadata,
  ) =>
    ({
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => req }),
    }) as never;

  const handler = () => undefined;

  /** Runs the interceptor over a handler that succeeds with `result`. */
  const run = async (
    config: (PublishEventConfig & { event: unknown }) | null,
    result: unknown,
    req: RequestWithMetadata = makeRequest(),
  ): Promise<unknown> => {
    jest.spyOn(reflector, 'get').mockReturnValue(config);
    return lastValueFrom(
      interceptor.intercept(contextFor(config, req), { handle: () => of(result) }),
    );
  };

  /**
   * Runs the interceptor over a handler that THROWS. Returns the error that
   * reached the caller: the failure event must never replace it.
   */
  const runFailing = async (
    config: (PublishEventConfig & { event: unknown }) | null,
    thrown: unknown,
    req: RequestWithMetadata = makeRequest(),
  ): Promise<unknown> => {
    jest.spyOn(reflector, 'get').mockReturnValue(config);
    return lastValueFrom(
      interceptor.intercept(contextFor(config, req), {
        handle: () => throwError(() => thrown),
      }),
    ).catch((error: unknown) => error);
  };

  /** The envelope handed to the bridge for the most recent publish. */
  const published = (): Record<string, unknown> => {
    const call = publish.mock.calls.at(-1) ?? publishSafely.mock.calls.at(-1);
    return (call?.[1] ?? {}) as Record<string, unknown>;
  };

  beforeEach(() => {
    publish = jest.fn().mockResolvedValue('1-0');
    publishSafely = jest.fn().mockResolvedValue('1-0');
    reflector = new Reflector();
    interceptor = new EventPublishInterceptor(reflector, {
      publish,
      publishSafely,
    } as unknown as EventBridgeService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('pass-through', () => {
    it('does nothing for a handler without @PublishEvent', async () => {
      await run(null, { id: 'x' });
      expect(publish).not.toHaveBeenCalled();
      expect(publishSafely).not.toHaveBeenCalled();
    });
  });

  describe('workspace resolution', () => {
    it('publishes with the request workspaceId', async () => {
      await run({ event: EVENT_CATALOG.target.created }, { id: 't-1' });
      expect(published()).toMatchObject({ workspaceId: WORKSPACE });
    });

    it('falls back to the config extractor when no request workspace exists', async () => {
      // workspace.created: the workspace is created BY the call, so there is
      // no request workspace to read.
      await run(
        {
          event: EVENT_CATALOG.workspace.created,
          workspaceId: (r) => (r as { id?: string })?.id,
        },
        { id: WORKSPACE },
        makeRequest({ workspaceId: undefined }),
      );
      expect(published()).toMatchObject({ workspaceId: WORKSPACE });
    });

    it('SKIPS the event when no workspace can be resolved', async () => {
      await run(
        { event: EVENT_CATALOG.target.created },
        { id: 't-1' },
        makeRequest({ workspaceId: undefined }),
      );
      expect(publish).not.toHaveBeenCalled();
      expect(publishSafely).not.toHaveBeenCalled();
    });
  });

  describe('identity', () => {
    it('skips the event for a request with neither session nor api key', async () => {
      await run(
        { event: EVENT_CATALOG.target.created },
        { id: 't-1' },
        makeRequest({ session: undefined, user: undefined }),
      );
      expect(publish).not.toHaveBeenCalled();
    });

    it('attributes an API-key request to api_key with no actor id', async () => {
      await run(
        { event: EVENT_CATALOG.target.created },
        { id: 't-1' },
        makeRequest({
          session: undefined,
          user: undefined,
          headers: { 'x-oasm-api-key': 'key-123' },
        }),
      );
      expect(published()).toMatchObject({
        actor: { type: 'api_key', name: 'key-123' },
      });
    });
  });

  describe('envelope', () => {
    it('carries outcome success on the happy path', async () => {
      await run({ event: EVENT_CATALOG.target.created }, { id: 't-1' });
      expect(published()).toMatchObject({ outcome: AuditOutcome.Success });
    });

    it('builds a subject the consumer can filter on without decoding data', async () => {
      await run(
        {
          event: EVENT_CATALOG.target.created,
          resourceId: (r) => (r as { id?: string })?.id,
        },
        { id: 't-1' },
      );
      const call = publish.mock.calls.at(-1);
      expect(call?.[2]).toMatchObject({
        subject: `workspace:${WORKSPACE}/target:t-1`,
      });
    });

    it('lets the config override the subject', async () => {
      await run(
        {
          event: EVENT_CATALOG.target.created,
          subject: () => 'custom',
        },
        { id: 't-1' },
      );
      expect(publish.mock.calls.at(-1)?.[2]).toMatchObject({
        subject: 'custom',
      });
    });
  });

  describe('persistence policy', () => {
    it('uses the throwing publish for a persist:true event', async () => {
      // Losing an audit row silently is the failure mode the plan rejects.
      await run({ event: EVENT_CATALOG.target.created }, { id: 't-1' });
      expect(publish).toHaveBeenCalled();
      expect(publishSafely).not.toHaveBeenCalled();
    });

    it('uses the best-effort publish for a persist:false event', async () => {
      await run({ event: EVENT_CATALOG.asset.discovered }, { id: 'a-1' });
      expect(publishSafely).toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    });
  });

  describe('extractor safety', () => {
    it('skips the event when an extractor throws', async () => {
      await run(
        {
          event: EVENT_CATALOG.target.created,
          changes: () => {
            throw new Error('bad extractor');
          },
        },
        { id: 't-1' },
      );
      expect(publish).not.toHaveBeenCalled();
    });
  });

  describe('unknown event names', () => {
    it('never publishes a name the catalog does not declare', async () => {
      await run({ event: 'job.startd' }, { id: 'j-1' });
      expect(publish).not.toHaveBeenCalled();
      expect(publishSafely).not.toHaveBeenCalled();
    });
  });

  describe('failure path', () => {
    // The audit trail records failed attempts today (the old interceptor caught
    // 4xx/5xx), so the wrap must keep emitting on the way out.
    it('emits with outcome failure when the handler throws', async () => {
      await runFailing(
        { event: EVENT_CATALOG.target.created },
        new Error('boom'),
      );
      expect(published()).toMatchObject({ outcome: AuditOutcome.Failure });
    });

    it('rethrows the original error so the client still sees it', async () => {
      const error = new Error('boom');
      const caught = await runFailing(
        { event: EVENT_CATALOG.target.created },
        error,
      );
      expect(caught).toBe(error);
    });

    it('falls back to the route param when the extractor cannot resolve a resource', async () => {
      const req = makeRequest({
        params: { id: 't-9' },
        body: undefined,
      });
      await runFailing({ event: EVENT_CATALOG.target.created }, new Error('boom'), req);
      expect(published()).toMatchObject({ resourceId: 't-9' });
    });
  });

  describe('secret redaction', () => {
    // The load-bearing security case. A published event is TRANSPORT: it sits
    // in Redis and is forwarded verbatim to customer webhooks by the
    // integrations lane. A credential that reaches `publish` has therefore left
    // the trust boundary, so redaction has to happen before the call, not in
    // one of the sinks.
    it('strips a credential key from metadata', async () => {
      await run(
        {
          event: EVENT_CATALOG.integration.settings.updated,
          metadata: () => ({ name: 'Jira', apiToken: 'ghp_realtoken0123456789' }),
        },
        { id: 'i-1' },
      );

      const written = published().metadata as Record<string, unknown>;
      expect(written).toEqual({ name: 'Jira' });
    });

    it('masks a credential pasted under an innocuous key', async () => {
      await run(
        {
          event: EVENT_CATALOG.integration.settings.updated,
          changes: () => ({ note: { after: 'sk-live-abcdef123456' } }),
        },
        { id: 'i-1' },
      );

      expect(published().changes).toEqual({ note: { after: '***' } });
    });

    it('redacts nested payloads, not just the top level', async () => {
      await run(
        {
          event: EVENT_CATALOG.integration.settings.updated,
          payload: () => ({
            config: { name: 'Jira', credentials: { password: 'hunter2' } },
          }),
        },
        { id: 'i-1' },
      );

      expect(published().payload).toEqual({ config: { name: 'Jira' } });
    });

    it('leaves ordinary data untouched', async () => {
      await run(
        {
          event: EVENT_CATALOG.integration.settings.updated,
          metadata: () => ({ count: 3, target: 'example.com' }),
        },
        { id: 'i-1' },
      );

      expect(published().metadata).toEqual({ count: 3, target: 'example.com' });
    });
  });

  describe('redis failures', () => {
    it('does not let a publish failure change the response', async () => {
      // The publish is fire-and-forget from the caller's perspective: a Redis
      // outage must not turn a successful request into a 500.
      publish.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await run({ event: EVENT_CATALOG.target.created }, { id: 't-1' });
      expect(result).toEqual({ id: 't-1' });
    });
  });
});