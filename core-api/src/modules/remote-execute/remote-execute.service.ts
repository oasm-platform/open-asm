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

  private static normalizeEventType(raw: string | number): ResultEventType | null {
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
      let unsubscribed = false;

      const handler = (ch: string, message: string) => {
        if (ch !== channel) return;
        observer.next({ data: message });
      };

      this.redisService.subscribe(channel, handler).then(() => {
        if (unsubscribed) {
          this.redisService.unsubscribe(channel).catch((err) => {
            this.logger.warn(`Failed to unsubscribe ${channel}: ${err}`);
          });
        }
      }).catch((err: unknown) => {
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

        const normalizedType = RemoteExecuteService.normalizeEventType(parsed.type);
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
        events.push(event);

        try {
          onEvent?.({ type: event.type, data: event.data, exitCode: event.exitCode });
        } catch (err) {
          this.logger.warn(`onEvent callback threw: ${err instanceof Error ? err.message : String(err)}`);
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

    this.logger.debug(`[waitForResult] Subscription confirmed, pushing command`);

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

    this.logger.debug(
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
          this.remoteExecuteSubscribeService.removeSession(sessionId);
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

    this.logger.debug(
      `[waitForResult] Done. timedOut=${isTimedOut}, events=${events.length}, exitCode=${exitEvent?.exitCode}`,
    );

    const { stdout, stderr } = events.reduce(
      (acc, e) => {
        if (e.type === ResultEventType.STDOUT) acc.stdout += e.data;
        if (e.type === ResultEventType.STDERR) acc.stderr += e.data;
        return acc;
      },
      { stdout: '', stderr: '' },
    );

    return {
      id: pushResult.id,
      workerId: pushResult.workerId,
      sessionId,
      command,
      stdout,
      stderr,
      exitCode: exitEvent?.exitCode ?? null,
      error: errorEvent?.data ?? null,
      timedOut: isTimedOut,
    };
  }
}
