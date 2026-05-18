import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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

@Injectable()
export class RemoteExecuteService {
  constructor(
    private readonly redisService: RedisService,
    private readonly remoteExecuteSubscribeService: RemoteExecuteSubscribeService,
  ) {}

  runCommand(
    command: string,
    sessionId: string,
    _user?: UserContextPayload,
  ): RemoteCommandPayload {
    const workerId = this.remoteExecuteSubscribeService.getAvailableWorker();

    if (!workerId) {
      throw new ServiceUnavailableException(
        'No available worker for remote execution',
      );
    }

    const result = this.remoteExecuteSubscribeService.pushCommand(
      workerId,
      sessionId,
      command,
    );

    if (!result) {
      throw new ServiceUnavailableException(
        'Selected worker became unavailable',
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
    user: UserContextPayload,
  ): Observable<MessageEvent> {
    const channel = `remote-execute:results:${user.id}:${sessionId}`;
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
}
