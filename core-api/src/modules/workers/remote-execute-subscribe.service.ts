import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Subject } from 'rxjs';
import { WorkerInstance } from './entities/worker.entity';

export interface RemoteExecuteCommand {
  id: string;
  workerId: string;
  type: number;
  sessionId: string;
  command: string;
}

@Injectable()
export class RemoteExecuteSubscribeService implements OnModuleDestroy {
  private readonly logger = new Logger(RemoteExecuteSubscribeService.name);
  private readonly workers = new Map<
    string,
    Subject<RemoteExecuteCommand>
  >();

  registerWorker(
    worker: WorkerInstance,
  ): Subject<RemoteExecuteCommand> {
    const subject = new Subject<RemoteExecuteCommand>();
    this.workers.set(worker.id, subject);

    const workerId = worker.id;
    const cleanup = () => {
      this.workers.delete(workerId);
      this.logger.debug(`Worker ${workerId} unsubscribed`);
    };
    subject.subscribe({ complete: cleanup, error: cleanup });

    return subject;
  }

  getWorkerSubject(
    workerId: string,
  ): Subject<RemoteExecuteCommand> | undefined {
    return this.workers.get(workerId);
  }

  getAvailableWorker(): string | null {
    for (const [workerId, subject] of this.workers) {
      if (!subject.closed) {
        return workerId;
      }
    }
    return null;
  }

  pushCommand(
    workerId: string,
    sessionId: string,
    command: string,
  ): RemoteExecuteCommand | null {
    const subject = this.workers.get(workerId);
    if (!subject || subject.closed) {
      this.logger.warn(
        `Worker ${workerId} is not subscribed or stream closed`,
      );
      return null;
    }

    const payload: RemoteExecuteCommand = {
      id: nanoid(),
      workerId,
      type: 2, // REMOTE_EXECUTE_SUBSCRIBE_EVENT_COMMAND
      sessionId,
      command,
    };

    subject.next(payload);
    return payload;
  }

  onModuleDestroy() {
    for (const subject of this.workers.values()) {
      subject.complete();
    }
    this.workers.clear();
  }
}
