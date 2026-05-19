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
}
