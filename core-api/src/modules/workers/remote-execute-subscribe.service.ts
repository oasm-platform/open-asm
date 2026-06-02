import { AgentConversation } from '@/modules/agents/entities/agent-conversation.entity';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { nanoid } from 'nanoid';
import { finalize, ReplaySubject } from 'rxjs';
import { Repository } from 'typeorm';
import { WorkerInstance } from './entities/worker.entity';
import { WorkersService } from './workers.service';

export interface RemoteExecuteCommand {
  id: string;
  workerId: string;
  type: number;
  sessionId: string;
  command: string;
}

export interface WorkerRegistration {
  subject: ReplaySubject<RemoteExecuteCommand>;
  observable: ReturnType<ReplaySubject<RemoteExecuteCommand>['asObservable']>;
}

@Injectable()
export class RemoteExecuteSubscribeService implements OnModuleDestroy {
  private readonly logger = new Logger(RemoteExecuteSubscribeService.name);

  private readonly workers = new Map<
    string,
    ReplaySubject<RemoteExecuteCommand>
  >();

  private readonly sessionWorkerMap = new Map<string, string>();

  constructor(
    @Inject(forwardRef(() => WorkersService))
    private readonly workersService: WorkersService,
    @InjectRepository(AgentConversation)
    private readonly conversationRepo: Repository<AgentConversation>,
  ) {}

  registerWorker(worker: WorkerInstance): WorkerRegistration {
    void this.workersService.enableAgentMode(worker.id);

    const subject = new ReplaySubject<RemoteExecuteCommand>(1);
    this.workers.set(worker.id, subject);

    const workerId = worker.id;
    const cleanup = () => {
      const currentSubject = this.workers.get(workerId);
      if (currentSubject === subject) {
        this.handleWorkerDisconnect(workerId);
        this.workers.delete(workerId);
        this.logger.log(`Worker ${workerId} disconnected, cleaned up`);
      } else {
        this.logger.verbose(
          `Worker ${workerId} stream finalized but a newer subscription exists — skipping cleanup`,
        );
      }
    };

    const observable = subject.asObservable().pipe(finalize(cleanup));

    return { subject, observable };
  }

  getWorkerSubject(
    workerId: string,
  ): ReplaySubject<RemoteExecuteCommand> | undefined {
    return this.workers.get(workerId);
  }

  private isWorkerAlive(workerId: string): boolean {
    const subject = this.workers.get(workerId);
    return subject !== undefined && !subject.closed;
  }

  private getNextAvailableWorker(): string | null {
    for (const [workerId, subject] of this.workers) {
      if (!subject.closed) {
        return workerId;
      }
    }
    return null;
  }

  getOrAssignWorker(sessionId: string): string | null {
    const existingWorkerId = this.sessionWorkerMap.get(sessionId);

    if (existingWorkerId) {
      if (this.isWorkerAlive(existingWorkerId)) {
        return existingWorkerId;
      }

      this.logger.warn(
        `Worker ${existingWorkerId} for session ${sessionId} disconnected, reassigning...`,
      );
      this.sessionWorkerMap.delete(sessionId);
    }

    const workerId = this.getNextAvailableWorker();
    if (workerId) {
      this.sessionWorkerMap.set(sessionId, workerId);
    }

    return workerId;
  }

  pushCommand(
    workerId: string,
    sessionId: string,
    command: string,
  ): RemoteExecuteCommand | null {
    const subject = this.workers.get(workerId);
    if (!subject || subject.closed) {
      this.logger.warn(`Worker ${workerId} is not subscribed or stream closed`);
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

  pushCommandWithSession(
    sessionId: string,
    command: string,
  ): RemoteExecuteCommand | null {
    const workerId = this.getOrAssignWorker(sessionId);

    if (!workerId) {
      return null;
    }

    return this.pushCommand(workerId, sessionId, command);
  }

  async pushCommandWithConversation(
    conversationId: string,
    sessionId: string,
    command: string,
  ): Promise<RemoteExecuteCommand | null> {
    if (!conversationId) {
      return this.pushCommandWithSession(sessionId, command);
    }

    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      select: ['id', 'workerId'],
    });

    if (conversation?.workerId && this.isWorkerAlive(conversation.workerId)) {
      this.logger.verbose(
        `[StickyWorker] Using pinned worker ${conversation.workerId} for conversation ${conversationId}`,
      );
      return this.pushCommand(
        conversation.workerId,
        sessionId,
        command,
      );
    }

    const workerId = this.getNextAvailableWorker();
    if (!workerId) {
      return null;
    }

    if (conversation) {
      await this.conversationRepo
        .createQueryBuilder()
        .update(AgentConversation)
        .set({ workerId })
        .where('id = :id AND ("workerId" IS NULL OR "workerId" != :workerId)', {
          id: conversationId,
          workerId,
        })
        .execute();
    }

    this.logger.log(
      `[StickyWorker] Assigned worker ${workerId} to conversation ${conversationId}`,
    );
    return this.pushCommand(workerId, sessionId, command);
  }

  removeSession(sessionId: string): void {
    this.sessionWorkerMap.delete(sessionId);
  }

  getSessionWorkerId(sessionId: string): string | undefined {
    return this.sessionWorkerMap.get(sessionId);
  }

  private handleWorkerDisconnect(workerId: string): void {
    const affectedSessions: string[] = [];

    for (const [sessionId, wId] of this.sessionWorkerMap) {
      if (wId === workerId) {
        affectedSessions.push(sessionId);
      }
    }

    for (const sessionId of affectedSessions) {
      this.sessionWorkerMap.delete(sessionId);
      this.logger.warn(
        `Session ${sessionId} lost its worker ${workerId} due to disconnection`,
      );
    }
  }

  onModuleDestroy() {
    for (const subject of this.workers.values()) {
      subject.complete();
    }
    this.workers.clear();
    this.sessionWorkerMap.clear();
  }
}
