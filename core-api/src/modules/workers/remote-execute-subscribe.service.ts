import type { WrapperType } from '@/common/types/app.types';
import { AgentConversation } from '@/modules/agents/entities/agent-conversation.entity';
import { RedisService } from '@/services/redis/redis.service';
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
    private readonly workersService: WrapperType<WorkersService>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepo: Repository<AgentConversation>,
    private readonly redisService: RedisService,
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

  private static readonly CONV_WORKER_TTL = 86_400; // 1 day in seconds

  /**
   * Reads the cached worker ID for a conversation from Redis.
   * Returns null if no cache entry exists or on error.
   */
  private async getCachedConversationWorker(
    conversationId: string,
  ): Promise<string | null> {
    try {
      return await this.redisService.get(
        `agent:conv:worker:${conversationId}`,
      );
    } catch (err) {
      this.logger.warn(
        `[RedisCache] Failed to read cached worker for ${conversationId}: ${err}`,
      );
      return null;
    }
  }

  /**
   * Writes the conversation-to-worker mapping to Redis with 1-day TTL.
   * Fire-and-forget: non-blocking, failures are logged but do not block command push.
   */
  private async cacheConversationWorker(
    conversationId: string,
    workerId: string,
  ): Promise<void> {
    try {
      await this.redisService.setex(
        `agent:conv:worker:${conversationId}`,
        RemoteExecuteSubscribeService.CONV_WORKER_TTL,
        workerId,
      );
    } catch (err) {
      this.logger.warn(
        `[RedisCache] Failed to cache worker ${workerId} for conversation ${conversationId}: ${err}`,
      );
    }
  }

  /**
   * Deletes the Redis cache entry for a conversation-to-worker mapping.
   */
  private async deleteCachedConversationWorker(
    conversationId: string,
  ): Promise<void> {
    try {
      await this.redisService.del(`agent:conv:worker:${conversationId}`);
    } catch (err) {
      this.logger.warn(
        `[RedisCache] Failed to delete cached worker for conversation ${conversationId}: ${err}`,
      );
    }
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

    // 1. Try Redis cache first (fast path)
    const cachedWorkerId =
      await this.getCachedConversationWorker(conversationId);

    if (cachedWorkerId && this.isWorkerAlive(cachedWorkerId)) {
      this.logger.verbose(
        `[StickyWorker][Redis] Using cached worker ${cachedWorkerId} for conversation ${conversationId}`,
      );
      return this.pushCommand(cachedWorkerId, sessionId, command);
    }

    if (cachedWorkerId) {
      // Cached worker is dead — clear stale cache
      this.logger.warn(
        `[StickyWorker][Redis] Cached worker ${cachedWorkerId} dead, clearing for conversation ${conversationId}`,
      );
      await this.deleteCachedConversationWorker(conversationId);
    }

    // 2. Try Postgres (existing sticky logic)
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      select: ['id', 'workerId'],
    });

    if (conversation?.workerId && this.isWorkerAlive(conversation.workerId)) {
      this.logger.verbose(
        `[StickyWorker][DB] Using pinned worker ${conversation.workerId} for conversation ${conversationId}`,
      );
      // Warm the Redis cache
      void this.cacheConversationWorker(conversationId, conversation.workerId);
      return this.pushCommand(conversation.workerId, sessionId, command);
    }

    // 3. Fallback to any available worker
    const workerId = this.getNextAvailableWorker();
    if (!workerId) {
      return null;
    }

    // Push command FIRST — ensures the worker subject is still alive
    // before updating the conversation record (TOCTOU race prevention).
    const result = this.pushCommand(workerId, sessionId, command);
    if (!result) {
      this.logger.warn(
        `[StickyWorker] Worker ${workerId} became unavailable before command could be pushed`,
      );
      return null;
    }

    // Persist assignment to both Postgres and Redis
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

      // Write to Redis cache (fire-and-forget)
      void this.cacheConversationWorker(conversationId, workerId);
    }

    this.logger.log(
      `[StickyWorker] Assigned worker ${workerId} to conversation ${conversationId}`,
    );
    return result;
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
