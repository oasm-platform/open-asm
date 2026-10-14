import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RedisService } from '@/services/redis/redis.service';
import {
  type RemoteExecuteCommand,
  RemoteExecuteSubscribeService,
  type ToolRunPayload,
} from '@/modules/workers/remote-execute-subscribe.service';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';

export interface RemoteCommandPayload {
  id: string;
  workerId: string;
  sessionId: string;
  command: string;
}

export interface RemoteCommandResult {
  id: string;
  workerId: string;
  sessionId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error: string | null;
  timedOut: boolean;
  /** stdout went past maxOutputChars: only its start is kept. */
  stdoutTruncated: boolean;
}

/** Default cap on the stdout/stderr kept in memory per call. */
export const REMOTE_OUTPUT_MAX_CHARS = 10 * 1024 * 1024;

export interface ToolRunWaitOptions {
  abortSignal?: AbortSignal;
  /** Runs once the worker has the tool run (e.g. pin the conversation). */
  onPushed?: () => Promise<void>;
  maxOutputChars?: number;
}

interface CollectOptions {
  onEvent?: ResultEventListener;
  abortSignal?: AbortSignal;
  maxOutputChars?: number;
  onPushed?: () => Promise<void>;
  /** Core stopped waiting (timeout/abort) before the worker finished. */
  onGiveUp?: (pushed: RemoteExecuteCommand) => void;
}

enum ResultEventType {
  STDOUT = 1,
  STDERR = 2,
  EXIT = 3,
  ERROR = 4,
}

type ResultEventListener = (event: {
  type: ResultEventType;
  data: string;
  exitCode: number;
}) => void;

interface ResultEvent {
  id: string;
  sessionId: string;
  type: ResultEventType;
  data: string;
  exitCode: number;
}

@Injectable()
export class RemoteExecuteService {
  private readonly logger = new Logger(RemoteExecuteService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly remoteExecuteSubscribeService: RemoteExecuteSubscribeService,
  ) {}

  private static normalizeEventType(
    raw: string | number,
  ): ResultEventType | null {
    if (typeof raw === 'number') {
      if (raw >= 1 && raw <= 4) return raw;
      return null;
    }

    const map: Record<string, ResultEventType> = {
      REMOTE_EXECUTE_RESULT_STDOUT: ResultEventType.STDOUT,
      REMOTE_EXECUTE_RESULT_STDERR: ResultEventType.STDERR,
      REMOTE_EXECUTE_RESULT_EXIT: ResultEventType.EXIT,
      REMOTE_EXECUTE_RESULT_ERROR: ResultEventType.ERROR,
      '1': ResultEventType.STDOUT,
      '2': ResultEventType.STDERR,
      '3': ResultEventType.EXIT,
      '4': ResultEventType.ERROR,
    };

    return map[raw] ?? null;
  }

  runCommand(
    command: string,
    sessionId: string,
    workspaceId: string,
    _user?: UserContextPayload,
  ): RemoteCommandPayload {
    const result = this.remoteExecuteSubscribeService.pushCommandWithSession(
      sessionId,
      command,
      workspaceId,
    );

    if (!result) {
      throw new ServiceUnavailableException(
        'No available worker for remote execution',
      );
    }

    return {
      id: result.id,
      workerId: result.workerId,
      sessionId,
      command,
    };
  }

  subscribeToStream(
    sessionId: string,
    _user: UserContextPayload,
  ): Observable<MessageEvent> {
    const channel = `remote-execute:results:${sessionId}`;
    return new Observable<MessageEvent>((observer) => {
      let unsubscribed = false;

      const handler = (ch: string, message: string) => {
        if (ch !== channel) return;
        observer.next({ data: message });
      };

      this.redisService
        .subscribe(channel, handler)
        .then(() => {
          if (unsubscribed) {
            this.redisService.unsubscribe(channel).catch((err) => {
              this.logger.warn(`Failed to unsubscribe ${channel}: ${err}`);
            });
          }
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          observer.error(new Error(`Redis subscribe failed: ${message}`));
        });

      return () => {
        unsubscribed = true;
        this.redisService.unsubscribe(channel).catch((err) => {
          this.logger.warn(`Failed to unsubscribe ${channel}: ${err}`);
        });
      };
    });
  }

  /**
   * Subscribe to Redis channel FIRST, then push the command.
   * This prevents the race condition where fast commands finish
   * before we can subscribe to their results.
   *
   * Collects all events (stdout, stderr) until EXIT or ERROR is received.
   */
  waitForResult(
    command: string,
    sessionId: string,
    conversationId: string,
    workspaceId: string,
    timeoutMs = 60_000,
    onEvent?: ResultEventListener,
  ): Promise<RemoteCommandResult> {
    return this.collectResults(
      sessionId,
      command,
      () =>
        this.remoteExecuteSubscribeService.pushCommandWithConversation(
          conversationId,
          workspaceId,
          sessionId,
          command,
        ),
      timeoutMs,
      { onEvent },
    );
  }

  /**
   * Runs one connector tool on the given worker and returns its raw output.
   * Not a job: nothing is written to the database. `command` in the result
   * is `<tool> <target>` for display. When core stops waiting (timeout or
   * abort) the worker is told to kill the run.
   */
  waitForToolRun(
    workerId: string,
    toolRun: ToolRunPayload,
    sessionId: string,
    timeoutMs: number,
    options: ToolRunWaitOptions = {},
  ): Promise<RemoteCommandResult> {
    return this.collectResults(
      sessionId,
      `${toolRun.tool} ${toolRun.target}`,
      () =>
        Promise.resolve(
          this.remoteExecuteSubscribeService.pushToolRun(
            workerId,
            sessionId,
            toolRun,
          ),
        ),
      timeoutMs,
      {
        ...options,
        onGiveUp: (pushed) =>
          this.remoteExecuteSubscribeService.pushCancelToolRun(
            pushed.workerId,
            sessionId,
          ),
      },
    );
  }

  private async collectResults(
    sessionId: string,
    command: string,
    push: () => Promise<RemoteExecuteCommand | null>,
    timeoutMs: number,
    {
      onEvent,
      abortSignal,
      maxOutputChars = REMOTE_OUTPUT_MAX_CHARS,
      onPushed,
      onGiveUp,
    }: CollectOptions = {},
  ): Promise<RemoteCommandResult> {
    const channel = `remote-execute:results:${sessionId}`;

    // Output is accumulated as it arrives, capped: a chatty tool must not
    // hold hundreds of MB per call in the heap.
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let eventCount = 0;
    let exitEvent: ResultEvent | undefined;
    let errorEvent: ResultEvent | undefined;
    const append = (kept: string, data: string): string => {
      const room = maxOutputChars - kept.length;
      if (room <= 0) return kept;
      return data.length > room ? kept + data.slice(0, room) : kept + data;
    };
    let resolved = false;
    let waitResolve: (() => void) | null = null;

    this.logger.debug(`[waitForResult] Subscribing to channel: ${channel}`);

    await this.redisService.subscribe(channel, (ch, raw) => {
      if (ch !== channel) return;
      if (resolved) return;

      this.logger.debug(
        `[waitForResult] Received message on ${ch}: ${raw.substring(0, 100)}`,
      );

      try {
        const parsed = JSON.parse(raw) as {
          id: string;
          sessionId: string;
          type: string | number;
          data: string;
          exitCode: number;
        };

        const normalizedType = RemoteExecuteService.normalizeEventType(
          parsed.type,
        );
        if (normalizedType === null) {
          this.logger.warn(
            `[waitForResult] Unknown event type "${String(parsed.type)}" — skipping`,
          );
          return;
        }

        const event: ResultEvent = {
          id: parsed.id,
          sessionId: parsed.sessionId,
          type: normalizedType,
          data: parsed.data,
          exitCode: parsed.exitCode,
        };
        eventCount++;
        const data = event.data ?? '';
        if (event.type === ResultEventType.STDOUT) {
          if (stdout.length + data.length > maxOutputChars) {
            stdoutTruncated = true;
          }
          stdout = append(stdout, data);
        } else if (event.type === ResultEventType.STDERR) {
          stderr = append(stderr, data);
        } else if (event.type === ResultEventType.EXIT) {
          exitEvent ??= event;
        } else {
          errorEvent ??= event;
        }

        try {
          onEvent?.({
            type: event.type,
            data: event.data,
            exitCode: event.exitCode,
          });
        } catch (err) {
          this.logger.warn(
            `onEvent callback threw: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        this.logger.debug(
          `[waitForResult] Event type: ${event.type}, exitCode: ${event.exitCode}`,
        );

        if (
          event.type === ResultEventType.EXIT ||
          event.type === ResultEventType.ERROR
        ) {
          resolved = true;
          this.logger.debug(
            `[waitForResult] Command finished, type=${event.type}`,
          );

          this.remoteExecuteSubscribeService.removeSession(sessionId);

          this.redisService.unsubscribe(channel).catch((err) => {
            this.logger.warn(`Failed to unsubscribe from ${channel}: ${err}`);
          });

          if (waitResolve) {
            waitResolve();
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to parse Redis message: ${err}`);
      }
    });

    // Cancelled while subscribing: never start the work.
    if (abortSignal?.aborted) {
      resolved = true;
      this.redisService.unsubscribe(channel).catch((err) => {
        this.logger.warn(`Failed to unsubscribe on abort: ${err}`);
      });
      return {
        id: '',
        workerId: '',
        sessionId,
        command,
        stdout: '',
        stderr: '',
        exitCode: null,
        error: 'Cancelled by user',
        timedOut: false,
        stdoutTruncated: false,
      };
    }

    this.logger.debug(
      `[waitForResult] Subscription confirmed, pushing command`,
    );

    const pushResult = await push();

    if (!pushResult) {
      this.redisService.unsubscribe(channel).catch((err) => {
        this.logger.warn(`Failed to unsubscribe after push failure: ${err}`);
      });
      throw new ServiceUnavailableException(
        'No available worker for remote execution',
      );
    }

    if (onPushed) {
      try {
        await onPushed();
      } catch (err) {
        this.logger.warn(
          `onPushed callback threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.debug(
      `[waitForResult] Command pushed, waiting for result (timeout: ${timeoutMs}ms)`,
    );

    let timer: NodeJS.Timeout | undefined;
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      waitResolve?.();
    };
    await new Promise<void>((resolve) => {
      waitResolve = resolve;
      if (resolved) {
        // EXIT/ERROR already arrived while onPushed ran.
        resolve();
        return;
      }
      if (abortSignal?.aborted) onAbort();
      abortSignal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.logger.warn(
            `[waitForResult] Timeout after ${timeoutMs}ms, collected ${eventCount} events`,
          );
          this.remoteExecuteSubscribeService.removeSession(sessionId);
          this.redisService.unsubscribe(channel).catch((err) => {
            this.logger.warn(`Failed to unsubscribe on timeout: ${err}`);
          });
          onGiveUp?.(pushResult);
        }
        resolve();
      }, timeoutMs);
    });
    clearTimeout(timer);
    abortSignal?.removeEventListener('abort', onAbort);
    if (aborted && !resolved) {
      resolved = true;
      this.remoteExecuteSubscribeService.removeSession(sessionId);
      this.redisService.unsubscribe(channel).catch((err) => {
        this.logger.warn(`Failed to unsubscribe on abort: ${err}`);
      });
      onGiveUp?.(pushResult);
    }

    const isTimedOut = !exitEvent && !errorEvent;

    this.logger.debug(
      `[waitForResult] Done. timedOut=${isTimedOut}, events=${eventCount}, exitCode=${exitEvent?.exitCode}`,
    );

    return {
      id: pushResult.id,
      workerId: pushResult.workerId,
      sessionId,
      command,
      stdout,
      stderr,
      exitCode: exitEvent?.exitCode ?? null,
      error: errorEvent?.data ?? (aborted ? 'Cancelled by user' : null),
      timedOut: isTimedOut && !aborted,
      stdoutTruncated,
    };
  }
}
