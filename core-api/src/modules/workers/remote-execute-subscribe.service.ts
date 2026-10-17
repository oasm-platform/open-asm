import { WorkerScope, WorkerType } from '@/common/enums/enum';
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

export interface RegisterWorkerOptions {
  /**
   * The worker runs agent shell commands in a per-session sandbox container
   * (it subscribed with AGENT_SANDBOX_HEADER).
   */
  sandboxed?: boolean;
}

/** What the subscribe service knows about a connected worker. */
interface ConnectedWorker {
  workspaceId: string | null;
  scope: WorkerScope;
  type: WorkerType;
  sandboxed: boolean;
}

/**
 * Global = cloud scope AND built-in, as createCloudWorker makes them. PROVIDER
 * workers (tool API keys) are cloud-scoped too but never global.
 */
export function isGlobalWorker(worker: {
  scope: WorkerScope;
  type: WorkerType;
}): boolean {
  return (
    worker.scope === WorkerScope.CLOUD && worker.type === WorkerType.BUILT_IN
  );
}

/**
 * A workspace worker serves its own workspace's agents; a global worker
 * serves every workspace, but only when it sandboxes agent commands — a
 * shared host must never run one tenant's shell next to another's.
 */
function servesAgents(worker: ConnectedWorker): boolean {
  if (worker.type === WorkerType.PROVIDER) return false;
  if (worker.scope === WorkerScope.WORKSPACE) return true;
  return isGlobalWorker(worker) && worker.sandboxed;
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

  /**
   * The worker each session's last push went to (every push path). Results
   * for the session are accepted only from it.
   */
  private readonly resultWorkerMap = new Map<string, string>();

  /**
   * Who each connected worker may serve: a workspace worker its own
   * workspace, a sandboxed global worker every workspace (see servesAgents).
   */
  private readonly workerScope = new Map<string, ConnectedWorker>();

  constructor(
    @Inject(forwardRef(() => WorkersService))
    private readonly workersService: WrapperType<WorkersService>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepo: Repository<AgentConversation>,
    private readonly redisService: RedisService,
  ) {}

  registerWorker(
    worker: WorkerInstance,
    options: RegisterWorkerOptions = {},
  ): WorkerRegistration {
    const connected: ConnectedWorker = {
      workspaceId: worker.workspaceId ?? worker.workspace?.id ?? null,
      scope: worker.scope,
      type: worker.type,
      sandboxed: options.sandboxed === true,
    };
    const logFlagError = (err: unknown) =>
      this.logger.warn(
        `Failed to update agent mode of worker ${worker.id}: ${String(err)}`,
      );
    if (servesAgents(connected)) {
      void this.workersService.enableAgentMode(worker.id).catch(logFlagError);
    } else {
      // A stale flag would still list it to agents and admit it as a pin
      void this.workersService
        .setAgentMode(worker.id, false)
        .catch(logFlagError);
      if (isGlobalWorker(connected)) {
        this.logger.warn(
          `Global worker ${worker.id} subscribed without an agent sandbox — it serves no agents`,
        );
      }
    }
    this.workerScope.set(worker.id, connected);

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

  /**
   * True when `workerId` is online for agents of `workspaceId` right now: its
   * RemoteExecute stream is open and it may serve the workspace. The worker
   * pickers list and accept only these, so a user can never choose a worker
   * that could not run the command.
   */
  isAgentReady(workerId: string, workspaceId: string): boolean {
    return this.canServe(workerId, workspaceId);
  }

  /** A connected worker of this workspace, or a connected sandboxed global one. */
  private canServe(workerId: string, workspaceId: string): boolean {
    const connected = this.workerScope.get(workerId);
    if (!connected || !this.isWorkerAlive(workerId)) return false;
    if (!servesAgents(connected)) return false;
    return isGlobalWorker(connected) || connected.workspaceId === workspaceId;
  }

  /** Prefers the workspace's own workers; falls back to a global one. */
  private getNextAvailableWorker(workspaceId: string): string | null {
    let globalWorkerId: string | null = null;
    for (const workerId of this.workers.keys()) {
      if (!this.canServe(workerId, workspaceId)) continue;
      const connected = this.workerScope.get(workerId);
      if (connected && !isGlobalWorker(connected)) {
        return workerId;
      }
      globalWorkerId ??= workerId;
    }
    return globalWorkerId;
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

    this.resultWorkerMap.set(sessionId, workerId);
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
    this.resultWorkerMap.set(sessionId, workerId);
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
   * → a connected worker of the workspace, else a global one. Nothing new is persisted here:
   * when `pin` is set the caller pins the fallback with pinConversationWorker
   * once its push succeeded, so a failed push never pins a dead worker.
   * A pin that fails the scope rule (another workspace's worker) is cleared; an
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
    this.resultWorkerMap.delete(sessionId);
  }

  /**
   * Whether a result for this session may come from this worker: only the
   * worker its last push went to. A session with no recorded push (already
   * finished, or pushed before a restart) is accepted as before.
   */
  isResultFromAssignedWorker(sessionId: string, workerId: string): boolean {
    const assigned = this.resultWorkerMap.get(sessionId);
    return assigned === undefined || assigned === workerId;
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

    for (const [sessionId, wId] of this.resultWorkerMap) {
      if (wId === workerId) this.resultWorkerMap.delete(sessionId);
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
    this.resultWorkerMap.clear();
  }
}
