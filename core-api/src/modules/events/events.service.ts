import {
  EVENT_BUS_READ_BLOCK_MS,
  EVENT_BUS_STREAM,
} from '@/common/constants/app.constants';
import { RedisService } from '@/services/redis/redis.service';
import type { StreamEntry } from '@/services/redis/redis.service';
import type { MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { NOTIFICATION_CHANNEL_PREFIX } from '../event-bridge/sinks/notifications/notifications.sink';
import { parseData } from '../event-bridge/transport/stream-codec';
import {
  type ClientEvent,
  isClientEvent,
  NOTIFICATION_CREATED,
} from './client-events';

type Listener = (event: ClientEvent) => void;

/** Name of this service's blocking Redis connection. */
const STREAM_READER = 'events:live';
const READ_COUNT = 100;
const RETRY_DELAY_MS = 1_000;
/** Below the usual 30-60s idle timeout of proxies and load balancers. */
export const HEARTBEAT_MS = 25_000;

/**
 * Live fan-out behind `GET /events/stream`.
 *
 * Two sources, merged per connection:
 *  - the event bridge stream, filtered to the connection's workspace (only
 *    when it has one — a user without a workspace still gets notifications);
 *  - the user's notification pub/sub channel (`NotificationsSink.deliver`).
 *
 * The stream is read with ONE plain `XREAD` loop per replica, never a consumer
 * group: a group hands each entry to a single replica, while the SSE client
 * waiting for it may be connected to any of them. The loop only runs while at
 * least one workspace connection is open, and starts at the newest entry — a
 * UI has no use for events that happened while nobody was listening.
 *
 * Notifications use ONE pattern subscription per replica, routed through
 * {@link users}: per-user channel subscriptions would put one listener per
 * connected user on the shared subscriber, each run for every message.
 */
@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly workspaces = new Map<string, Set<Listener>>();
  private readonly users = new Map<string, Set<Listener>>();
  /** Pending or established pattern subscription; cleared on failure. */
  private notifications?: Promise<void>;
  private reading = false;
  private stopped = false;

  constructor(private readonly redis: RedisService) {}

  /** SSE stream for one connection; tears its listeners down on disconnect. */
  stream(
    workspaceId: string | undefined,
    userId: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const listener: Listener = (event) => subscriber.next({ data: event });
      const leaveWorkspace = workspaceId
        ? this.join(this.workspaces, workspaceId, listener)
        : undefined;
      const leaveUser = this.join(this.users, userId, listener);
      // A named event: SSE clients only dispatch unnamed ones as data, so
      // heartbeats never reach a handler.
      const heartbeat = setInterval(
        () => subscriber.next({ type: 'ping', data: '' }),
        HEARTBEAT_MS,
      );

      this.listenToNotifications();
      if (workspaceId) this.startReading();

      return () => {
        clearInterval(heartbeat);
        leaveWorkspace?.();
        leaveUser();
      };
    });
  }

  onModuleDestroy(): void {
    this.stopped = true;
  }

  private join(
    registry: Map<string, Set<Listener>>,
    key: string,
    listener: Listener,
  ): () => void {
    let listeners = registry.get(key);
    if (!listeners) {
      listeners = new Set();
      registry.set(key, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) registry.delete(key);
    };
  }

  /**
   * Subscribes once; a failed attempt is forgotten so the next connection
   * retries instead of every later one assuming it is in place.
   */
  private listenToNotifications(): void {
    this.notifications ??= this.redis
      .psubscribe(`${NOTIFICATION_CHANNEL_PREFIX}*`, (channel, message) =>
        this.dispatchNotification(channel, message),
      )
      .catch((error: unknown) => {
        this.notifications = undefined;
        this.logFailure('subscribe', error);
      });
  }

  private dispatchNotification(channel: string, message: string): void {
    const listeners = this.users.get(
      channel.slice(NOTIFICATION_CHANNEL_PREFIX.length),
    );
    if (!listeners || !isClientEvent(NOTIFICATION_CREATED)) return;

    const notificationId = parseJson<{ notificationId?: string }>(message)
      ?.notificationId;
    if (!notificationId) return;

    this.emit(listeners, {
      id: notificationId,
      type: NOTIFICATION_CREATED,
      time: new Date().toISOString(),
      resourceType: 'notification',
      resourceId: notificationId,
    });
  }

  /** Starts the tail loop unless it is already running. */
  private startReading(): void {
    if (this.reading) return;
    this.reading = true;
    void this.read();
  }

  private async read(): Promise<void> {
    let lastId: string | undefined;
    try {
      while (!this.stopped && this.workspaces.size > 0) {
        try {
          // Inside the retry: a Redis blip here must not end the loop while
          // clients are still connected.
          lastId ??= (await this.redis.xlast(EVENT_BUS_STREAM))?.id ?? '0-0';
          const entries = await this.redis.xread(
            EVENT_BUS_STREAM,
            STREAM_READER,
            lastId,
            READ_COUNT,
            EVENT_BUS_READ_BLOCK_MS,
          );
          for (const entry of entries) {
            lastId = entry.id;
            this.dispatchEntry(entry);
          }
        } catch (error) {
          if (this.stopped) break;
          this.logFailure('read', error);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    } finally {
      // Same tick as the loop's exit check, so a client joining afterwards
      // always sees `reading === false` and restarts it.
      this.reading = false;
    }
  }

  private dispatchEntry(entry: StreamEntry): void {
    const { type, id, time } = entry.fields;
    // Filter on the name first, so most entries are skipped undecoded.
    if (!type || !id || !isClientEvent(type)) return;

    // The bridge's own decoder: an entry every sink drops as unattributable
    // is not forwarded either.
    const data = parseData(entry.fields.data);
    if (!data) return;

    const joinKeyId = data.metadata?.joinKeyId;
    this.emit(this.workspaces.get(data.workspaceId), {
      id,
      type,
      time,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      ...(typeof joinKeyId === 'string' && { joinKeyId }),
    });
  }

  private emit(listeners: Set<Listener> | undefined, event: ClientEvent): void {
    if (!listeners) return;
    for (const listener of listeners) {
      listener(event);
    }
  }

  private logFailure(action: string, error: unknown): void {
    this.logger.error(
      `Live event ${action} failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
}

function parseJson<T>(raw: string): T | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as T)
      : undefined;
  } catch {
    return undefined;
  }
}
