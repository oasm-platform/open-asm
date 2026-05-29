import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventStreamType } from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import { Redis } from 'ioredis';

const STREAM_KEY = 'oasm:event-hub';
const MAXLEN = 0;

type EventHandler = (payload: Record<string, unknown>) => Promise<void> | void;

@Injectable()
export class EventHubService implements OnModuleDestroy {
  private readonly logger = new Logger(EventHubService.name);
  private readonly consumers = new Map<string, Redis>();
  private readonly consumerHandlers = new Map<string, Set<EventHandler>>();
  private readonly consumerTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly CONSUMER_PREFIX = 'oasm-consumer';

  constructor(private readonly redisService: RedisService) {}

  async initConsumerGroups(): Promise<void> {
    const client = this.redisService.client;

    for (const streamType of Object.values(EventStreamType)) {
      const groupName = streamType;

      try {
        await client.xgroup('CREATE', STREAM_KEY, groupName, '0', 'MKSTREAM');
        this.logger.log(`Consumer group "${groupName}" created`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        // -BUSYGROUP means the group already exists, which is fine
        if (!message.includes('BUSYGROUP')) {
          this.logger.error(`Failed to create consumer group "${groupName}": ${message}`);
        }
      }
    }
  }

  async dispatch(type: EventStreamType, payload: Record<string, unknown>): Promise<string | null> {
    const client = this.redisService.client;

    const fields: string[] = [];
    fields.push('event_type', type);
    fields.push('payload', JSON.stringify(payload));
    fields.push('timestamp', new Date().toISOString());

    const entryId = await client.xadd(
      STREAM_KEY,
      'MAXLEN',
      '~',
      String(MAXLEN),
      '*',
      ...fields,
    );

    this.logger.debug(`Dispatched event "${type}" with id=${entryId}`);
    return entryId;
  }

  subscribe(type: EventStreamType, handler: EventHandler): () => void {
    const groupName = type;

    if (!this.consumerHandlers.has(groupName)) {
      this.consumerHandlers.set(groupName, new Set());
      this.startConsumer(groupName);
    }

    this.consumerHandlers.get(groupName)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.consumerHandlers.get(groupName);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.stopConsumer(groupName);
          this.consumerHandlers.delete(groupName);
        }
      }
    };
  }

  private startConsumer(groupName: string): void {
    const consumerName = `${this.CONSUMER_PREFIX}-${groupName}-${Date.now()}`;
    const client = this.redisService.client.duplicate();

    this.consumers.set(groupName, client);

    const poll = async (): Promise<void> => {
      try {
        const results = (await client.xreadgroup(
          'GROUP',
          groupName,
          consumerName,
          'COUNT',
          '10',
          'BLOCK',
          '2000',
          'STREAMS',
          STREAM_KEY,
          '>',
        )) as [string, [string, string[]][]][] | null;

        if (!results) return;

        for (const [, entries] of results) {
          for (const [messageId, fields] of entries) {
            const parsed = this.parseFields(fields);
            const handlers = this.consumerHandlers.get(groupName);

            if (handlers) {
              for (const handler of handlers) {
                try {
                  await handler(parsed);
                } catch (error: unknown) {
                  this.logger.error(
                    `Handler error in group "${groupName}": ${error instanceof Error ? error.message : String(error)}`,
                  );
                }
              }
            }

            await client.xack(STREAM_KEY, groupName, messageId);
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Consumer "${groupName}" read error: ${message}`);
      }
    };

    const timer = setInterval(() => {
      void poll();
    }, 100);

    this.consumerTimers.set(groupName, timer);
    this.logger.log(`Consumer started for group "${groupName}"`);
  }

  private stopConsumer(groupName: string): void {
    const timer = this.consumerTimers.get(groupName);
    if (timer) {
      clearInterval(timer);
      this.consumerTimers.delete(groupName);
    }

    const client = this.consumers.get(groupName);
    if (client) {
      void client.quit();
      this.consumers.delete(groupName);
    }

    this.logger.log(`Consumer stopped for group "${groupName}"`);
  }

  private parseFields(fields: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < fields.length; i += 2) {
      const key = fields[i];
      const value = fields[i + 1];

      if (key === 'payload') {
        try {
          result[key] = JSON.parse(value) as Record<string, unknown>;
        } catch {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  async onModuleDestroy(): Promise<void> {
    for (const groupName of this.consumerHandlers.keys()) {
      this.stopConsumer(groupName);
    }

    for (const [, client] of this.consumers) {
      try {
        await client.quit();
      } catch {
        // ignore
      }
    }
  }
}
