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
  /** RUN_TOOL only. */
  toolRun?: ToolRunPayload;
}

/** One connector tool run for an agent (proto ToolRun). Not a job. */
export interface ToolRunPayload {
  tool: string;
  image: string;
  target: string;
  configJson: string;
  cpu?: string;
  memory?: string;
  timeoutSeconds?: number;
}

/** The worker picked for a conversation's next push. */
export interface ConversationWorkerPick {
  workerId: string;
  /** Persist it as the conversation's pin once the push succeeded. */
  pin: boolean;
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

  /** In-flight tool runs (session id → worker), failed fast on disconnect. */
  private readonly toolRunWorkerMap = new Map<string, string>();

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

  pushToolRun(
    workerId: string,
    sessionId: string,
    toolRun: ToolRunPayload,
  ): RemoteExecuteCommand | null {
    const subject = this.workers.get(workerId);
    if (!subject || subject.closed) {
      this.logger.warn(`Worker ${workerId} is not subscribed or stream closed`);
      return null;
    }
    const payload: RemoteExecuteCommand = {
      id: nanoid(),
      workerId,
      type: 3, // REMOTE_EXECUTE_SUBSCRIBE_EVENT_RUN_TOOL
      sessionId,
      command: '',
      toolRun,
    };
    subject.next(payload);
    this.toolRunWorkerMap.set(sessionId, workerId);
    return payload;
  }

  /** Tells the worker to kill the tool run of this session. */
  pushCancelToolRun(workerId: string, sessionId: string): void {
    const subject = this.workers.get(workerId);
    if (!subject || subject.closed) return;
    subject.next({
      id: nanoid(),
      workerId,
      type: 4, // REMOTE_EXECUTE_SUBSCRIBE_EVENT_CANCEL_TOOL
      sessionId,
      command: '',
    });
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
    const pick = await this.pickConversationWorker(conversationId, workspaceId);
    if (!pick) return null;
    const pushed = this.pushCommand(pick.workerId, sessionId, command);
    if (pushed && pick.pin) {
      await this.pinConversationWorker(conversationId, pick.workerId);
    }
    return pushed;
  }

  /**
   * The worker to serve a conversation's next push: Redis pin → Postgres pin
   * → any connected worker of the workspace. Nothing new is persisted here:
   * when `pin` is set the caller pins the fallback with pinConversationWorker
   * once its push succeeded, so a failed push never pins a dead worker.
   * A pin that fails the scope rule (other workspace, cloud) is cleared; an
   * in-scope pin whose worker is merely offline is kept — a fallback serves
   * this push only.
   */
  async pickConversationWorker(
    conversationId: string,
    workspaceId: string,
  ): Promise<ConversationWorkerPick | null> {
    const cachedWorkerId =
      await this.getCachedConversationWorker(conversationId);
    if (cachedWorkerId && this.canServe(cachedWorkerId, workspaceId)) {
      return { workerId: cachedWorkerId, pin: false };
    }
    if (cachedWorkerId) {
      await this.deleteCachedConversationWorker(conversationId);
    }

    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      select: ['id', 'workerId'],
    });
    const pinned = conversation?.workerId;
    if (pinned && this.canServe(pinned, workspaceId)) {
      void this.cacheConversationWorker(conversationId, pinned);
      return { workerId: pinned, pin: false };
    }

    const pinInScope =
      !!pinned &&
      (await this.workersService.isAgentWorkerForWorkspace(
        pinned,
        workspaceId,
      ));
    const workerId = this.getNextAvailableWorker(workspaceId);
    if (!workerId) {
      if (pinned && !pinInScope) {
        await this.writeConversationPin(conversationId, null);
      }
      return null;
    }
    return { workerId, pin: !!conversation && !pinInScope };
  }

  /** Persists workerId as the conversation's pin (Postgres + Redis). */
  async pinConversationWorker(
    conversationId: string,
    workerId: string,
  ): Promise<void> {
    await this.writeConversationPin(conversationId, workerId);
    void this.cacheConversationWorker(conversationId, workerId);
    this.logger.log(
      `[StickyWorker] Assigned worker ${workerId} to conversation ${conversationId}`,
    );
  }

  private async writeConversationPin(
    conversationId: string,
    workerId: string | null,
  ): Promise<void> {
    await this.conversationRepo
      .createQueryBuilder()
      .update(AgentConversation)
      .set({ workerId: workerId as string })
      .where('id = :id', { id: conversationId })
      .execute();
  }

  removeSession(sessionId: string): void {
    this.sessionWorkerMap.delete(sessionId);
    this.toolRunWorkerMap.delete(sessionId);
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

    // A tool run's waiter would otherwise block until its timeout: end it now
    // with the same ERROR event the worker would have sent.
    for (const [sessionId, wId] of this.toolRunWorkerMap) {
      if (wId !== workerId) continue;
      this.toolRunWorkerMap.delete(sessionId);
      void this.redisService
        .publish(
          `remote-execute:results:${sessionId}`,
          JSON.stringify({
            id: '',
            sessionId,
            type: 4, // REMOTE_EXECUTE_RESULT_ERROR
            data: 'worker disconnected during the tool run',
            exitCode: 0,
          }),
        )
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to fail tool run ${sessionId} on disconnect: ${String(err)}`,
          );
        });
    }
  }

  onModuleDestroy() {
    for (const subject of this.workers.values()) {
      subject.complete();
    }
    this.workers.clear();
    this.workerScope.clear();
    this.sessionWorkerMap.clear();
    this.toolRunWorkerMap.clear();
  }
}
