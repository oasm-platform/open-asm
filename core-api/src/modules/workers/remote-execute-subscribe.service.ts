import { WorkerScope } from '@/common/enums/enum';
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
  /** CONNECTOR_JOB only: the gRPC Job payload. */
  job?: Record<string, unknown>;
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

  /** Who each connected worker may serve. Cloud workers never serve agents. */
  private readonly workerScope = new Map<
    string,
    { workspaceId: string | null; scope: WorkerScope }
  >();

  constructor(
    @Inject(forwardRef(() => WorkersService))
    private readonly workersService: WrapperType<WorkersService>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepo: Repository<AgentConversation>,
    private readonly redisService: RedisService,
  ) {}

  registerWorker(worker: WorkerInstance): WorkerRegistration {
    // Cloud workers never serve agents (cloud ToS): they keep the stream for
    // protocol compatibility but are never marked agent-capable.
    if (worker.scope !== WorkerScope.CLOUD) {
      void this.workersService.enableAgentMode(worker.id);
    }
    this.workerScope.set(worker.id, {
      workspaceId: worker.workspaceId ?? worker.workspace?.id ?? null,
      scope: worker.scope,
    });

    const subject = new ReplaySubject<RemoteExecuteCommand>(1);
    this.workers.set(worker.id, subject);

    const workerId = worker.id;
    const cleanup = () => {
      const currentSubject = this.workers.get(workerId);
      if (currentSubject === subject) {
        this.handleWorkerDisconnect(workerId);
        this.workers.delete(workerId);
        this.workerScope.delete(workerId);
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
      return await this.redisService.get(`agent:conv:worker:${conversationId}`);
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

  /** A connected workspace worker of this workspace — never cloud. */
  private canServe(workerId: string, workspaceId: string): boolean {
    const scope = this.workerScope.get(workerId);
    return (
      this.isWorkerAlive(workerId) &&
      scope?.scope === WorkerScope.WORKSPACE &&
      scope.workspaceId === workspaceId
    );
  }

  private getNextAvailableWorker(workspaceId: string): string | null {
    for (const workerId of this.workers.keys()) {
      if (this.canServe(workerId, workspaceId)) {
        return workerId;
      }
    }
    return null;
  }

  getOrAssignWorker(sessionId: string, workspaceId: string): string | null {
    const existingWorkerId = this.sessionWorkerMap.get(sessionId);
    if (existingWorkerId && this.canServe(existingWorkerId, workspaceId)) {
      return existingWorkerId;
    }
    this.sessionWorkerMap.delete(sessionId);

    const workerId = this.getNextAvailableWorker(workspaceId);
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

  pushConnectorJob(
    workerId: string,
    sessionId: string,
    job: Record<string, unknown>,
  ): boolean {
    const subject = this.workers.get(workerId);
    if (!subject || subject.closed) {
      this.logger.warn(`Worker ${workerId} is not subscribed or stream closed`);
      return false;
    }
    subject.next({
      id: nanoid(),
      workerId,
      type: 3, // REMOTE_EXECUTE_SUBSCRIBE_EVENT_CONNECTOR_JOB
      sessionId,
      command: '',
      job,
    });
    return true;
  }

  pushCommandWithSession(
    sessionId: string,
    command: string,
    workspaceId: string,
  ): RemoteExecuteCommand | null {
    const workerId = this.getOrAssignWorker(sessionId, workspaceId);
    return workerId ? this.pushCommand(workerId, sessionId, command) : null;
  }

  async pushCommandWithConversation(
    conversationId: string,
    workspaceId: string,
    sessionId: string,
    command: string,
  ): Promise<RemoteExecuteCommand | null> {
    if (!conversationId) {
      return this.pushCommandWithSession(sessionId, command, workspaceId);
    }
    const workerId = await this.resolveConversationWorker(
      conversationId,
      workspaceId,
    );
    return workerId ? this.pushCommand(workerId, sessionId, command) : null;
  }

  /**
   * The worker serving a conversation: Redis pin → Postgres pin → any
   * connected worker of the workspace. A pin that no longer qualifies (other
   * workspace, cloud, disconnected) is cleared. A new fallback is pinned.
   */
  async resolveConversationWorker(
    conversationId: string,
    workspaceId: string,
  ): Promise<string | null> {
    const cachedWorkerId =
      await this.getCachedConversationWorker(conversationId);
    if (cachedWorkerId && this.canServe(cachedWorkerId, workspaceId)) {
      return cachedWorkerId;
    }
    if (cachedWorkerId) {
      await this.deleteCachedConversationWorker(conversationId);
    }

    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      select: ['id', 'workerId'],
    });
    if (
      conversation?.workerId &&
      this.canServe(conversation.workerId, workspaceId)
    ) {
      void this.cacheConversationWorker(conversationId, conversation.workerId);
      return conversation.workerId;
    }

    const workerId = this.getNextAvailableWorker(workspaceId);
    // Rewrite the pin for a new fallback. With none, clear it only when it fails
    // the scope rule — an in-scope worker that is merely offline stays pinned.
    const stalePin = conversation?.workerId;
    const shouldWrite =
      !!conversation &&
      stalePin !== workerId &&
      (!!workerId ||
        (!!stalePin &&
          !(await this.workersService.isAgentWorkerForWorkspace(
            stalePin,
            workspaceId,
          ))));
    if (shouldWrite) {
      await this.conversationRepo
        .createQueryBuilder()
        .update(AgentConversation)
        .set({ workerId: (workerId ?? null) as string })
        .where('id = :id', { id: conversationId })
        .execute();
    }
    if (workerId) {
      void this.cacheConversationWorker(conversationId, workerId);
      this.logger.log(
        `[StickyWorker] Assigned worker ${workerId} to conversation ${conversationId}`,
      );
    }
    return workerId;
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
    this.workerScope.clear();
    this.sessionWorkerMap.clear();
  }
}
