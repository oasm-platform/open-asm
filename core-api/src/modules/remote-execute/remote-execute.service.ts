import { Injectable } from '@nestjs/common';
import { RedisService } from '@/services/redis/redis.service';
import { nanoid } from 'nanoid';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';

export interface RemoteCommandPayload {
  id: string;
  sessionId: string;
  command: string;
}

const REDIS_CHANNEL = 'remote-execute:commands';

@Injectable()
export class RemoteExecuteService {
  constructor(private readonly redisService: RedisService) {}

  async runCommand(command: string): Promise<RemoteCommandPayload> {
    const payload: RemoteCommandPayload = {
      id: nanoid(),
      sessionId: randomUUID(),
      command,
    };

    await this.redisService.publish(
      REDIS_CHANNEL,
      JSON.stringify(payload),
    );

    return payload;
  }

  subscribeToStream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const handler = (_channel: string, message: string) => {
        observer.next({ data: message });
      };

      void this.redisService.subscribe(REDIS_CHANNEL, handler);

      return () => {
        void this.redisService.unsubscribe(REDIS_CHANNEL);
      };
    });
  }
}
