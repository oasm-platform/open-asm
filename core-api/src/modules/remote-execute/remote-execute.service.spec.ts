import { ServiceUnavailableException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { RedisService } from '@/services/redis/redis.service';
import { RemoteExecuteSubscribeService } from '@/modules/workers/remote-execute-subscribe.service';
import { RemoteExecuteService } from './remote-execute.service';

type SubscribeCallback = (channel: string, message: string) => void;

describe('RemoteExecuteService', () => {
  let service: RemoteExecuteService;
  let mockRedisService: {
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
  };
  let mockRemoteExecuteSubscribeService: {
    pushCommandWithConversation: jest.Mock;
    pushToolRun: jest.Mock;
    pushCancelToolRun: jest.Mock;
    removeSession: jest.Mock;
  };

  beforeEach(async () => {
    mockRedisService = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
    };

    mockRemoteExecuteSubscribeService = {
      pushCommandWithConversation: jest.fn(),
      pushToolRun: jest.fn(),
      pushCancelToolRun: jest.fn(),
      removeSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemoteExecuteService,
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: RemoteExecuteSubscribeService,
          useValue: mockRemoteExecuteSubscribeService,
        },
      ],
    }).compile();

    service = module.get<RemoteExecuteService>(RemoteExecuteService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // constructor
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // normalizeEventType (private static, accessed via bracket notation)
  // ---------------------------------------------------------------------------
  describe('normalizeEventType', () => {
    const normalizeEventType = (RemoteExecuteService as any)
      .normalizeEventType as (raw: string | number) => number;

    it('should pass through known number values without modification', () => {
      expect(normalizeEventType(1)).toBe(1);
      expect(normalizeEventType(2)).toBe(2);
      expect(normalizeEventType(3)).toBe(3);
      expect(normalizeEventType(4)).toBe(4);
      expect(normalizeEventType(5)).toBe(5);
    });

    it('should map the image event by name and number', () => {
      expect(normalizeEventType('REMOTE_EXECUTE_RESULT_IMAGE')).toBe(5);
      expect(normalizeEventType('5')).toBe(5);
    });

    it('should return null for unknown numeric values', () => {
      expect(normalizeEventType(99)).toBeNull();
      expect(normalizeEventType(0)).toBeNull();
      expect(normalizeEventType(-1)).toBeNull();
    });

    it('should map string names to correct ResultEventType enum values', () => {
      expect(normalizeEventType('REMOTE_EXECUTE_RESULT_STDOUT')).toBe(1);
      expect(normalizeEventType('REMOTE_EXECUTE_RESULT_STDERR')).toBe(2);
      expect(normalizeEventType('REMOTE_EXECUTE_RESULT_EXIT')).toBe(3);
      expect(normalizeEventType('REMOTE_EXECUTE_RESULT_ERROR')).toBe(4);
    });

    it('should map stringified numbers to correct enum values', () => {
      expect(normalizeEventType('1')).toBe(1);
      expect(normalizeEventType('2')).toBe(2);
      expect(normalizeEventType('3')).toBe(3);
      expect(normalizeEventType('4')).toBe(4);
    });

    it('should return null for unknown string values', () => {
      expect(normalizeEventType('UNKNOWN_TYPE')).toBeNull();
      expect(normalizeEventType('')).toBeNull();
      expect(normalizeEventType('some-random-value')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // waitForResult
  // ---------------------------------------------------------------------------
  describe('waitForResult', () => {
    const testCommand = 'whoami';
    const testSessionId = 'session-abc';
    const testConversationId = 'conv-123';
    const testWorkspaceId = 'ws-1';
    const channel = `remote-execute:results:${testSessionId}`;

    function setupCapturedSubscribe() {
      let capturedCb: SubscribeCallback;
      mockRedisService.subscribe.mockImplementation(
        (_ch: string, cb: SubscribeCallback) => {
          capturedCb = cb;
          return Promise.resolve();
        },
      );
      return {
        getCallback: () => capturedCb!,
      };
    }

    function fireMessage(
      cb: SubscribeCallback,
      ch: string,
      type: string | number,
      data: string,
      exitCode = 0,
      id = 'cmd-1',
      sessionId = testSessionId,
    ) {
      cb(ch, JSON.stringify({ id, sessionId, type, data, exitCode }));
    }

    function setupPushSuccess() {
      mockRemoteExecuteSubscribeService.pushCommandWithConversation.mockResolvedValue(
        {
          id: 'cmd-1',
          workerId: 'worker-1',
          sessionId: testSessionId,
          command: testCommand,
          type: 2,
        },
      );
    }

    // ------------------------------------------------------------------
    // Happy path
    // ------------------------------------------------------------------
    it('should collect STDOUT and return result on EXIT', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      fireMessage(
        cb,
        channel,
        'REMOTE_EXECUTE_RESULT_STDOUT',
        'output line 1\n',
      );
      fireMessage(
        cb,
        channel,
        'REMOTE_EXECUTE_RESULT_STDOUT',
        'output line 2\n',
      );
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_EXIT', '', 0);

      const result = await resultPromise;

      expect(result.stdout).toBe('output line 1\noutput line 2\n');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.id).toBe('cmd-1');
      expect(result.workerId).toBe('worker-1');
      expect(result.error).toBeNull();
      expect(result).not.toHaveProperty('image');
    });

    it('should keep a browser screenshot for the result only, without ending the wait', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();
      const onEvent = jest.fn();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
        onEvent,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'Example\n');
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_IMAGE', '/9j/AAAA');
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_EXIT', '', 0);

      const result = await resultPromise;

      expect(result.image).toBe('/9j/AAAA');
      expect(result.stdout).toBe('Example\n');
      expect(result.error).toBeNull();
      expect(result.exitCode).toBe(0);
      // The live terminal streams text: the image never reaches it.
      expect(
        (onEvent.mock.calls as Array<[{ type: number }]>).map(([e]) => e.type),
      ).toEqual([1, 3]);
    });

    it('should collect STDERR alongside STDOUT', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'ok\n');
      fireMessage(
        cb,
        channel,
        'REMOTE_EXECUTE_RESULT_STDERR',
        'warning: deprecated\n',
      );
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_EXIT', '', 0);

      const result = await resultPromise;

      expect(result.stdout).toBe('ok\n');
      expect(result.stderr).toBe('warning: deprecated\n');
      expect(result.exitCode).toBe(0);
    });

    it('should combine multiple STDOUT/STDERR events using single reduce (P4)', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'chunk1');
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'chunk2');
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDERR', 'err1');
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDERR', 'err2');
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_EXIT', '', 0);

      const result = await resultPromise;

      expect(result.stdout).toBe('chunk1chunk2');
      expect(result.stderr).toBe('err1err2');
    });

    it('should handle ERROR event type with error data', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      fireMessage(
        cb,
        channel,
        'REMOTE_EXECUTE_RESULT_STDOUT',
        'partial output\n',
      );
      fireMessage(
        cb,
        channel,
        'REMOTE_EXECUTE_RESULT_ERROR',
        'command not found',
        127,
      );

      const result = await resultPromise;

      expect(result.stdout).toBe('partial output\n');
      expect(result.error).toBe('command not found');
      expect(result.exitCode).toBeNull(); // ERROR, not EXIT
      expect(result.timedOut).toBe(false);
    });

    it('should handle numeric event types directly', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      // STDOUT = 1, EXIT = 3 (ResultEventType enum values)
      fireMessage(cb, channel, 1, 'numeric type stdout\n');
      fireMessage(cb, channel, 3, '', 0);

      const result = await resultPromise;

      expect(result.stdout).toBe('numeric type stdout\n');
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });

    // ------------------------------------------------------------------
    // Timeout
    // ------------------------------------------------------------------
    it('should return timedOut: true when no EXIT or ERROR within timeoutMs', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        50,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      // Fire STDOUT only — no EXIT or ERROR
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'partial...\n');

      const result = await resultPromise;

      expect(result.timedOut).toBe(true);
      expect(result.stdout).toBe('partial...\n');
      expect(result.exitCode).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should timeout when no events at all are received', async () => {
      setupCapturedSubscribe();
      setupPushSuccess();

      const result = await service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        50,
      );

      expect(result.timedOut).toBe(true);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    // ------------------------------------------------------------------
    // No worker
    // ------------------------------------------------------------------
    it('should throw ServiceUnavailableException when pushCommandWithConversation returns null', async () => {
      setupCapturedSubscribe();
      mockRemoteExecuteSubscribeService.pushCommandWithConversation.mockResolvedValue(
        null,
      );

      await expect(
        service.waitForResult(
          testCommand,
          testSessionId,
          testConversationId,
          testWorkspaceId,
          5000,
        ),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should unsubscribe on push failure (no worker)', async () => {
      setupCapturedSubscribe();
      mockRemoteExecuteSubscribeService.pushCommandWithConversation.mockResolvedValue(
        null,
      );

      try {
        await service.waitForResult(
          testCommand,
          testSessionId,
          testConversationId,
          testWorkspaceId,
          5000,
        );
      } catch {
        // Expected
      }

      expect(mockRedisService.unsubscribe).toHaveBeenCalledWith(channel);
    });

    // ------------------------------------------------------------------
    // Channel filtering (P0)
    // ------------------------------------------------------------------
    it('should ignore messages on wrong channel (P0)', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        50,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      // EXIT on wrong channel — should be ignored
      fireMessage(
        cb,
        'remote-execute:results:other-session',
        'REMOTE_EXECUTE_RESULT_EXIT',
        '',
        0,
        'cmd-other',
        'other-session',
      );

      // No EXIT on correct channel → timeout
      const result = await resultPromise;

      expect(result.timedOut).toBe(true);
    });

    it('should process messages on correct channel even after wrong-channel traffic', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      fireMessage(
        cb,
        'other-channel',
        'REMOTE_EXECUTE_RESULT_STDOUT',
        'wrong',
        0,
      );
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'correct\n');
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_EXIT', '', 0);

      const result = await resultPromise;

      expect(result.stdout).toBe('correct\n');
      expect(result.timedOut).toBe(false);
    });

    // ------------------------------------------------------------------
    // onEvent callback
    // ------------------------------------------------------------------
    it('should call onEvent callback for each event', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();
      const onEvent = jest.fn();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
        onEvent,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'line 1\n');
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDERR', 'err 1\n');
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_EXIT', '', 0);

      await resultPromise;

      expect(onEvent).toHaveBeenCalledTimes(3);
      expect(onEvent).toHaveBeenNthCalledWith(1, {
        type: 1,
        data: 'line 1\n',
        exitCode: 0,
      });
      expect(onEvent).toHaveBeenNthCalledWith(2, {
        type: 2,
        data: 'err 1\n',
        exitCode: 0,
      });
      expect(onEvent).toHaveBeenNthCalledWith(3, {
        type: 3,
        data: '',
        exitCode: 0,
      });
    });

    it('should log and continue when onEvent throws (P7)', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const onEvent = jest.fn().mockImplementation(() => {
        throw new Error('callback explosion');
      });

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
        onEvent,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      // STDOUT — onEvent throws but execution continues
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'line 1\n');
      // EXIT — still processed after previous onEvent threw
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_EXIT', '', 0);

      const result = await resultPromise;

      expect(result.stdout).toBe('line 1\n');
      expect(result.timedOut).toBe(false);
      expect(onEvent).toHaveBeenCalledTimes(2);
    });

    // ------------------------------------------------------------------
    // Completion behavior
    // ------------------------------------------------------------------
    it('should call removeSession on EXIT', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_EXIT', '', 0);

      await resultPromise;

      expect(
        mockRemoteExecuteSubscribeService.removeSession,
      ).toHaveBeenCalledWith(testSessionId);
    });

    it('should call removeSession on ERROR', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_ERROR', 'exec failed', 1);

      await resultPromise;

      expect(
        mockRemoteExecuteSubscribeService.removeSession,
      ).toHaveBeenCalledWith(testSessionId);
    });

    it('should call removeSession on timeout (no EXIT/ERROR) to prevent session leak', async () => {
      setupCapturedSubscribe();
      setupPushSuccess();

      await service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        50,
      );

      expect(
        mockRemoteExecuteSubscribeService.removeSession,
      ).toHaveBeenCalledWith(testSessionId);
    });

    // ------------------------------------------------------------------
    // Redis message parsing error resilience
    // ------------------------------------------------------------------
    it('should log warning and continue when Redis message is invalid JSON', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      // Garbage that can't be parsed
      cb(channel, 'not-valid-json{{{');

      // Valid EXIT still processed
      cb(
        channel,
        JSON.stringify({
          id: 'cmd-1',
          sessionId: testSessionId,
          type: 'REMOTE_EXECUTE_RESULT_EXIT',
          data: '',
          exitCode: 0,
        }),
      );

      const result = await resultPromise;

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
    });

    // ------------------------------------------------------------------
    // Edge: unknown event type normalizes to ERROR
    // ------------------------------------------------------------------
    it('should skip unknown event types and continue waiting for EXIT', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      // Unknown string — should be logged and skipped, NOT terminate
      fireMessage(
        cb,
        channel,
        'SOME_FUTURE_EVENT_TYPE',
        'unknown event data',
        0,
      );

      // STDOUT after unknown type still processed
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'output\n');

      // EXIT terminates normally
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_EXIT', '', 0);

      const result = await resultPromise;

      expect(result.stdout).toBe('output\n');
      expect(result.error).toBeNull();
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(
        mockRemoteExecuteSubscribeService.removeSession,
      ).toHaveBeenCalledWith(testSessionId);
    });

    // ------------------------------------------------------------------
    // Edge: SUBSCRIBE first, then push (race condition prevention)
    // ------------------------------------------------------------------
    it('should subscribe to Redis BEFORE pushing the command', async () => {
      const subscribeOrder: string[] = [];
      let capturedCb: SubscribeCallback;

      mockRedisService.subscribe.mockImplementation(
        (_ch: string, cb: SubscribeCallback) => {
          subscribeOrder.push('subscribe');
          capturedCb = cb;
          return Promise.resolve();
        },
      );

      mockRemoteExecuteSubscribeService.pushCommandWithConversation.mockImplementation(
        () => {
          subscribeOrder.push('pushCommand');
          return Promise.resolve({ id: 'cmd-1', workerId: 'worker-1' });
        },
      );

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));

      capturedCb!(
        channel,
        JSON.stringify({
          id: 'cmd-1',
          sessionId: testSessionId,
          type: 'REMOTE_EXECUTE_RESULT_EXIT',
          data: '',
          exitCode: 0,
        }),
      );

      await resultPromise;

      expect(subscribeOrder).toEqual(['subscribe', 'pushCommand']);
    });

    // ------------------------------------------------------------------
    // Edge: resolved flag prevents duplicate processing
    // ------------------------------------------------------------------
    it('should ignore events after EXIT has already been processed', async () => {
      const { getCallback } = setupCapturedSubscribe();
      setupPushSuccess();

      const resultPromise = service.waitForResult(
        testCommand,
        testSessionId,
        testConversationId,
        testWorkspaceId,
        5000,
      );

      await new Promise((r) => setTimeout(r, 10));
      const cb = getCallback();

      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'before exit\n');
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_EXIT', '', 0);
      // Late event after EXIT — should be ignored
      fireMessage(cb, channel, 'REMOTE_EXECUTE_RESULT_STDOUT', 'after exit\n');

      const result = await resultPromise;

      expect(result.stdout).toBe('before exit\n');
      expect(result.timedOut).toBe(false);
    });
  });

  describe('waitForToolRun', () => {
    const sessionId = 'run-1';
    const channel = `remote-execute:results:${sessionId}`;
    const toolRun = {
      tool: 'nmap',
      image: 'img',
      target: 'example.com',
      configJson: '',
    };

    let cb: SubscribeCallback;
    beforeEach(() => {
      mockRedisService.subscribe.mockImplementation(
        (_ch: string, fn: SubscribeCallback) => {
          cb = fn;
          return Promise.resolve();
        },
      );
      mockRemoteExecuteSubscribeService.pushToolRun.mockReturnValue({
        id: 'cmd-9',
        workerId: 'wk-1',
      });
    });

    it('pushes the tool run to the worker and returns the raw output', async () => {
      const promise = service.waitForToolRun('wk-1', toolRun, sessionId, 5000);
      await new Promise((r) => setTimeout(r, 10));
      cb(channel, JSON.stringify({ type: 1, data: 'open 80\n' }));
      cb(channel, JSON.stringify({ type: 3, data: '', exitCode: 0 }));

      const result = await promise;
      expect(
        mockRemoteExecuteSubscribeService.pushToolRun,
      ).toHaveBeenCalledWith('wk-1', sessionId, toolRun);
      expect(result).toMatchObject({
        command: 'nmap example.com',
        stdout: 'open 80\n',
        exitCode: 0,
        error: null,
        timedOut: false,
      });
    });

    it('stops waiting when the call is aborted and cancels the worker run', async () => {
      const controller = new AbortController();
      const promise = service.waitForToolRun(
        'wk-1',
        toolRun,
        sessionId,
        60_000,
        {
          abortSignal: controller.signal,
        },
      );
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const result = await promise;
      expect(result.error).toBe('Cancelled by user');
      expect(result.timedOut).toBe(false);
      expect(mockRedisService.unsubscribe).toHaveBeenCalledWith(channel);
      expect(
        mockRemoteExecuteSubscribeService.pushCancelToolRun,
      ).toHaveBeenCalledWith('wk-1', sessionId);
    });

    it('never pushes a run that was aborted before it started', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await service.waitForToolRun(
        'wk-1',
        toolRun,
        sessionId,
        60_000,
        { abortSignal: controller.signal },
      );
      expect(result.error).toBe('Cancelled by user');
      expect(
        mockRemoteExecuteSubscribeService.pushToolRun,
      ).not.toHaveBeenCalled();
      expect(mockRedisService.unsubscribe).toHaveBeenCalledWith(channel);
    });

    it('cancels the worker run when core times out', async () => {
      const result = await service.waitForToolRun(
        'wk-1',
        toolRun,
        sessionId,
        20,
      );
      expect(result.timedOut).toBe(true);
      expect(
        mockRemoteExecuteSubscribeService.pushCancelToolRun,
      ).toHaveBeenCalledWith('wk-1', sessionId);
    });

    it('does not cancel a run that finished', async () => {
      const promise = service.waitForToolRun('wk-1', toolRun, sessionId, 5000);
      await new Promise((r) => setTimeout(r, 10));
      cb(channel, JSON.stringify({ type: 3, data: '', exitCode: 0 }));
      await promise;
      expect(
        mockRemoteExecuteSubscribeService.pushCancelToolRun,
      ).not.toHaveBeenCalled();
    });

    it('keeps at most maxOutputChars of stdout', async () => {
      const promise = service.waitForToolRun('wk-1', toolRun, sessionId, 5000, {
        maxOutputChars: 10,
      });
      await new Promise((r) => setTimeout(r, 10));
      cb(channel, JSON.stringify({ type: 1, data: '1234567' }));
      cb(channel, JSON.stringify({ type: 1, data: '89abcdef' }));
      cb(channel, JSON.stringify({ type: 1, data: 'ghij' }));
      cb(channel, JSON.stringify({ type: 3, data: '', exitCode: 0 }));

      const result = await promise;
      expect(result.stdout).toBe('123456789a');
      expect(result.stdoutTruncated).toBe(true);
    });

    it('runs onPushed after the push, and still sees a fast EXIT', async () => {
      const order: string[] = [];
      mockRemoteExecuteSubscribeService.pushToolRun.mockImplementation(() => {
        order.push('push');
        return { id: 'cmd-9', workerId: 'wk-1' };
      });
      const result = await service.waitForToolRun(
        'wk-1',
        toolRun,
        sessionId,
        5000,
        {
          onPushed: async () => {
            order.push('pin');
            // The run finishes while the pin is being written.
            cb(channel, JSON.stringify({ type: 3, data: '', exitCode: 0 }));
            await new Promise((r) => setTimeout(r, 5));
          },
        },
      );
      expect(order).toEqual(['push', 'pin']);
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });

    it('throws when the worker stream is gone', async () => {
      mockRemoteExecuteSubscribeService.pushToolRun.mockReturnValue(null);
      await expect(
        service.waitForToolRun('wk-1', toolRun, sessionId, 5000),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
