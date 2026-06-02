import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '@/services/redis/redis.service';
import { RemoteExecuteSubscribeService } from '@/modules/workers/remote-execute-subscribe.service';
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
}

enum ResultEventType {
  STDOUT = 1,
  STDERR = 2,
  EXIT = 3,
  ERROR = 4,
}

/**
 * gRPC may serialize enum as string name (REMOTE_EXECUTE_RESULT_STDOUT)
 * or numeric value (1). Normalize to our numeric enum.
 */
function normalizeEventType(raw: string | number): ResultEventType {
  if (typeof raw === 'number') return raw;

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

  return map[raw] ?? ResultEventType.ERROR;
}

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

  runCommand(
    command: string,
    sessionId: string,
    _user?: UserContextPayload,
  ): RemoteCommandPayload {
    const result = this.remoteExecuteSubscribeService.pushCommandWithSession(
      sessionId,
      command,
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
      const handler = (_channel: string, message: string) => {
        observer.next({ data: message });
      };

      void this.redisService.subscribe(channel, handler);

      return () => {
        void this.redisService.unsubscribe(channel);
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
  async waitForResult(
    command: string,
    sessionId: string,
    conversationId: string,
    timeoutMs = 60_000,
    onEvent?: (event: { type: ResultEventType; data: string; exitCode: number }) => void,
  ): Promise<RemoteCommandResult> {
    const channel = `remote-execute:results:${sessionId}`;

    const events: ResultEvent[] = [];
    let resolved = false;
    let waitResolve: (() => void) | null = null;

    this.logger.log(`[waitForResult] Subscribing to channel: ${channel}`);

    await this.redisService.subscribe(channel, (ch, raw) => {
      if (resolved) return;

      this.logger.log(
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

        const event: ResultEvent = {
          id: parsed.id,
          sessionId: parsed.sessionId,
          type: normalizeEventType(parsed.type),
          data: parsed.data,
          exitCode: parsed.exitCode,
        };
        events.push(event);

        try {
          onEvent?.({ type: event.type, data: event.data, exitCode: event.exitCode });
        } catch {
          // Callback must not throw; silently ignore to avoid hanging execution
        }

        this.logger.log(
          `[waitForResult] Event type: ${event.type}, exitCode: ${event.exitCode}`,
        );

        if (
          event.type === ResultEventType.EXIT ||
          event.type === ResultEventType.ERROR
        ) {
          resolved = true;
          this.logger.log(
            `[waitForResult] Command finished, type=${event.type}`,
          );

          this.remoteExecuteSubscribeService.removeSession(sessionId);

          this.redisService
            .unsubscribe(channel)
            .catch((err) => {
              this.logger.warn(
                `Failed to unsubscribe from ${channel}: ${err}`,
              );
            });

          if (waitResolve) {
            waitResolve();
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to parse Redis message: ${err}`);
      }
    });

    this.logger.log(`[waitForResult] Subscription confirmed, pushing command`);

    const pushResult =
      await this.remoteExecuteSubscribeService.pushCommandWithConversation(
        conversationId,
        sessionId,
        command,
      );

    if (!pushResult) {
      this.redisService
        .unsubscribe(channel)
        .catch((err) => {
          this.logger.warn(`Failed to unsubscribe after push failure: ${err}`);
        });
      throw new ServiceUnavailableException(
        'No available worker for remote execution',
      );
    }

    this.logger.log(
      `[waitForResult] Command pushed, waiting for result (timeout: ${timeoutMs}ms)`,
    );

    await new Promise<void>((resolve) => {
      waitResolve = resolve;
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.logger.warn(
            `[waitForResult] Timeout after ${timeoutMs}ms, collected ${events.length} events`,
          );
          this.redisService
            .unsubscribe(channel)
            .catch((err) => {
              this.logger.warn(`Failed to unsubscribe on timeout: ${err}`);
            });
        }
        resolve();
      }, timeoutMs);
    });

    const exitEvent = events.find((e) => e.type === ResultEventType.EXIT);
    const errorEvent = events.find((e) => e.type === ResultEventType.ERROR);
    const isTimedOut = !exitEvent && !errorEvent;

    this.logger.log(
      `[waitForResult] Done. timedOut=${isTimedOut}, events=${events.length}, exitCode=${exitEvent?.exitCode}`,
    );

    return {
      id: pushResult.id,
      workerId: pushResult.workerId,
      sessionId,
      command,
      stdout: events
        .filter((e) => e.type === ResultEventType.STDOUT)
        .map((e) => e.data)
        .join(''),
      stderr: events
        .filter((e) => e.type === ResultEventType.STDERR)
        .map((e) => e.data)
        .join(''),
      exitCode: exitEvent?.exitCode ?? null,
      error: errorEvent?.data ?? null,
      timedOut: isTimedOut,
    };
  }
}
