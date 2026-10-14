import {
  AgentApprovalMode,
  AgentCommandApprovalStatus,
} from '@/common/enums/enum';
import {
  GetManyBaseResponseDto,
  SortOrder,
} from '@/common/dtos/get-many-base.dto';
import { RedisService } from '@/services/redis/redis.service';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import { type FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import {
  COMMAND_PREVIEW_LENGTH,
  previewCommand,
  type CommandApprovalResponseDto,
  type GetCommandApprovalsQueryDto,
} from './dto/command-approval.dto';
import { AgentCommandApproval } from './entities/agent-command-approval.entity';

/** Match `search` literally: `%` and `_` are LIKE wildcards. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export interface ApprovalContext {
  userId: string;
  workspaceId: string;
  conversationId: string;
  mode: AgentApprovalMode;
  /**
   * PLAN mode only: refuse tool calls until a plan has been approved (which
   * switches the mode), so the user sees the plan before anything runs.
   */
  planFirst?: boolean;
}

/**
 * The per-run part of an ApprovalContext. Tools read it at call time, so a
 * mode switch (approving a plan) applies to the rest of the run.
 */
export type ApprovalSettings = Omit<
  ApprovalContext,
  'workspaceId' | 'conversationId'
>;

export interface ApprovalRequestEvent {
  /** Identifies this prompt; pass it back to decide() or decidePlan() */
  approvalId: string;
  toolCallId: string;
  /** `plan`: approve a whole plan and pick how it runs (see decidePlan) */
  kind?: 'plan';
  command: string;
  mode: AgentApprovalMode;
  /** Set when the request is for a non-command tool call */
  tool?: string;
  /** Human-readable summary of what the tool does */
  description?: string;
  /** AI SDK tool metadata, including MCP source and annotations when present */
  toolMetadata?: Record<string, unknown>;
  /** Arguments the model passed to the tool */
  input?: unknown;
  /** The steps of the plan under review (`kind: 'plan'` only) */
  plan?: string[];
}

/** How an approved plan runs: without asking, or asking per command. */
export type PlanRunMode = AgentApprovalMode.AUTO | AgentApprovalMode.MANUAL;

export interface PlanDecision {
  allowed: boolean;
  /** Approvals only: the approval mode the rest of the run switches to */
  mode?: PlanRunMode;
  /** What the user told the agent to do instead (rejections only) */
  feedback?: string;
}

export interface ApprovalToolMeta {
  tool: string;
  description?: string;
  toolMetadata?: Record<string, unknown>;
  /**
   * Arguments shown to the user. When present they are what the user reviews,
   * so the emitted `command` is only a short label (see requestDecision).
   */
  input?: unknown;
  /** Only reads data: runs without asking outside PLAN-first runs */
  readOnly?: boolean;
}

/** Sent when a prompt no longer needs an answer, so the UI can drop it. */
export interface ApprovalResolvedEvent {
  approvalId: string;
}

export interface ApprovalDecision {
  allowed: boolean;
  /** What the user told the agent to do instead (rejections only) */
  feedback?: string;
  /** Refused without asking: the agent must get a plan approved first */
  planRequired?: boolean;
}

interface UserDecision {
  status: AgentCommandApprovalStatus;
  feedback?: string;
}

/** One tool call blocked on the user. */
interface PendingRequest {
  rowId: string;
  userId: string;
  workspaceId: string;
  conversationId: string;
  /** The tool that was called, for "allow this tool" */
  tool?: string;
  settle: (decision: UserDecision) => void;
}

/** A plan blocked on the user (PLAN mode). Never stored: plans are one-off. */
interface PendingPlan {
  userId: string;
  workspaceId: string;
  settle: (decision: PlanDecision) => void;
}

export const APPROVAL_TIMEOUT_MS = 5 * 60_000;
/** Conversation-wide approvals survive a restart, not an abandoned chat. */
export const CONVERSATION_APPROVAL_TTL_S = 7 * 24 * 60 * 60;
const KEY_PREFIX = 'agents:approval';
const FORGET_BATCH_SIZE = 500;

@Injectable()
export class AgentsApprovalsService {
  /**
   * approvalId -> blocked tool call. The approvalId is minted per request:
   * the DB row is shared by every request for the same command, so keying
   * waiters by row id lets one request's timeout or abort clobber another's.
   */
  private readonly pending = new Map<string, PendingRequest>();
  /** `${conversationId}:${hash}` -> decision currently being awaited */
  private readonly inFlight = new Map<string, Promise<ApprovalDecision>>();
  /** approvalId -> plan waiting for the user */
  private readonly pendingPlans = new Map<string, PendingPlan>();
  private readonly logger = new Logger(AgentsApprovalsService.name);

  /**
   * "Allow all" approvals (`all:<conversationId>`) live in Redis so they hold
   * across restarts and API instances.
   */
  constructor(
    @InjectRepository(AgentCommandApproval)
    private readonly repo: Repository<AgentCommandApproval>,
    private readonly redis: RedisService,
  ) {}

  private static allKey(conversationId: string): string {
    return `${KEY_PREFIX}:all:${conversationId}`;
  }

  /** Set of tool names the user allowed for the whole conversation */
  private static toolsKey(conversationId: string): string {
    return `${KEY_PREFIX}:tools:${conversationId}`;
  }

  private static conversationKeys(conversationId: string): string[] {
    return [
      AgentsApprovalsService.allKey(conversationId),
      AgentsApprovalsService.toolsKey(conversationId),
    ];
  }

  static normalize(command: string): string {
    // Whitespace inside quotes and multi-line shell input can be significant.
    // Only discard padding around the command before displaying or hashing it.
    return command.trim();
  }

  /**
   * Approvals are remembered per conversation: approving a command in one
   * chat says nothing about running it from another.
   */
  static hash(command: string, conversationId = ''): string {
    return createHash('sha256')
      .update(
        `${conversationId}\0${AgentsApprovalsService.normalize(command)}`,
      )
      .digest('hex');
  }

  /**
   * Resolves to `allowed: true` when the command may run. In AUTO mode it
   * always may; otherwise a previously approved identical command passes, and
   * anything else blocks until the user decides (or the request times out).
   * PLAN mode asks like MANUAL here: it only differs once a plan exists (see
   * requestPlanApproval), and approving that plan switches the mode.
   * Read-only tools and tools the user allowed for the conversation pass
   * without asking. When the user rejects with a message, it comes back as
   * `feedback`. `command` may be any size: only its hash is used for matching.
   */
  async authorize(
    command: string,
    toolCallId: string,
    ctx: ApprovalContext,
    emitter?: EventEmitter,
    meta?: ApprovalToolMeta,
    abortSignal?: AbortSignal,
  ): Promise<ApprovalDecision> {
    if (ctx.mode === AgentApprovalMode.AUTO) return { allowed: true };
    if (ctx.mode === AgentApprovalMode.PLAN && ctx.planFirst) {
      return { allowed: false, planRequired: true };
    }
    if (meta?.readOnly) return { allowed: true };
    if (await this.isConversationAllowed(ctx.conversationId, meta?.tool)) {
      return { allowed: true };
    }

    // Parallel tool calls with the same command in one conversation share one
    // prompt. Another conversation gets its own prompt, since its stream is
    // the only place that can show it.
    const hash = AgentsApprovalsService.hash(command, ctx.conversationId);
    const key = `${ctx.conversationId}:${hash}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const request = this.requestDecision(
      command,
      hash,
      toolCallId,
      ctx,
      emitter,
      meta,
      abortSignal,
    );
    this.inFlight.set(key, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async requestDecision(
    command: string,
    hash: string,
    toolCallId: string,
    ctx: ApprovalContext,
    emitter?: EventEmitter,
    meta?: ApprovalToolMeta,
    abortSignal?: AbortSignal,
  ): Promise<ApprovalDecision> {
    const normalized = AgentsApprovalsService.normalize(command);

    const existing = await this.repo.findOne({
      where: { userId: ctx.userId, hash },
    });
    if (existing?.status === AgentCommandApprovalStatus.APPROVED) {
      return { allowed: true };
    }
    if (abortSignal?.aborted) return { allowed: false };

    // The hash covers the whole input; only a preview is worth storing
    const row = await this.savePending(
      existing,
      hash,
      previewCommand(normalized),
      toolCallId,
      ctx,
    );

    const approvalId = randomUUID();
    const decision = new Promise<UserDecision>((resolve) => {
      const settle = (d: UserDecision) => {
        if (!this.pending.delete(approvalId)) return;
        clearTimeout(timer);
        abortSignal?.removeEventListener('abort', onAbort);
        // Settled by something other than this prompt (allow all, allow
        // tool, a timeout): the UI must not keep showing it
        emitter?.emit('approval-resolved', {
          approvalId,
        } satisfies ApprovalResolvedEvent);
        resolve(d);
      };
      // The client left (stop, reload, closed tab): nobody can answer any more
      const onAbort = () =>
        settle({ status: AgentCommandApprovalStatus.REJECTED });
      const timer = setTimeout(onAbort, APPROVAL_TIMEOUT_MS);
      this.pending.set(approvalId, {
        rowId: row.id,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        tool: meta?.tool,
        settle,
      });
      abortSignal?.addEventListener('abort', onAbort, { once: true });
    });

    // Send the user what they review once: the full command for a shell
    // command, or the full input with the command as a short label
    emitter?.emit('approval-required', {
      approvalId,
      toolCallId,
      command:
        meta?.input === undefined ? normalized : previewCommand(normalized),
      mode: ctx.mode,
      ...(meta && {
        tool: meta.tool,
        description: meta.description,
        toolMetadata: meta.toolMetadata,
        input: meta.input,
      }),
    } satisfies ApprovalRequestEvent);

    const { status, feedback } = await decision;
    if (status !== AgentCommandApprovalStatus.APPROVED) {
      // Timed out or abandoned: nobody decided, so there is nothing worth
      // keeping (a user's rejection is already saved and no longer pending),
      // unless another conversation is still asking about the same command
      if (!this.hasPendingFor(row.id)) {
        await this.repo.delete({
          id: row.id,
          status: AgentCommandApprovalStatus.PENDING,
        });
      }
      return { allowed: false, feedback };
    }
    return { allowed: true };
  }

  /**
   * PLAN mode: show the user a freshly formulated plan and block until they
   * approve it — choosing whether the run continues in AUTO or MANUAL mode —
   * or reject it. Leaving (abort) or not answering in time rejects it.
   */
  async requestPlanApproval(
    steps: string[],
    toolCallId: string,
    ctx: ApprovalContext,
    emitter?: EventEmitter,
    abortSignal?: AbortSignal,
  ): Promise<PlanDecision> {
    // Without a stream nobody can see the prompt
    if (!emitter || abortSignal?.aborted) return { allowed: false };

    const approvalId = randomUUID();
    const decision = new Promise<PlanDecision>((resolve) => {
      const settle = (d: PlanDecision) => {
        if (!this.pendingPlans.delete(approvalId)) return;
        clearTimeout(timer);
        abortSignal?.removeEventListener('abort', onAbort);
        resolve(d);
      };
      const onAbort = () => settle({ allowed: false });
      const timer = setTimeout(onAbort, APPROVAL_TIMEOUT_MS);
      this.pendingPlans.set(approvalId, {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        settle,
      });
      abortSignal?.addEventListener('abort', onAbort, { once: true });
    });

    emitter.emit('approval-required', {
      approvalId,
      toolCallId,
      kind: 'plan',
      command: '',
      mode: ctx.mode,
      tool: 'formulate_plan',
      description: 'Review the plan before the agent starts running it',
      plan: steps,
    } satisfies ApprovalRequestEvent);

    return decision;
  }

  /** Record the user's answer to a plan prompt and unblock the agent. */
  decidePlan(
    id: string,
    workspaceId: string,
    userId: string,
    decision: PlanDecision,
  ): void {
    const request = this.pendingPlans.get(id);
    if (request?.userId !== userId || request.workspaceId !== workspaceId) {
      throw new NotFoundException('Plan approval not found');
    }
    request.settle(
      decision.allowed
        ? { allowed: true, mode: decision.mode ?? AgentApprovalMode.MANUAL }
        : { allowed: false, feedback: decision.feedback },
    );
  }

  /** Upsert the (user, hash) row as pending for this request. */
  private async savePending(
    existing: AgentCommandApproval | null,
    hash: string,
    command: string,
    toolCallId: string,
    ctx: ApprovalContext,
  ): Promise<AgentCommandApproval> {
    const fields = {
      workspaceId: ctx.workspaceId,
      conversationId: ctx.conversationId,
      toolCallId,
      command,
      status: AgentCommandApprovalStatus.PENDING,
    };
    if (existing) return this.repo.save(Object.assign(existing, fields));
    try {
      return await this.repo.save(
        this.repo.create({ userId: ctx.userId, hash, ...fields }),
      );
    } catch (error) {
      // Another conversation created the row first (unique user + hash)
      const row = await this.repo.findOne({
        where: { userId: ctx.userId, hash },
      });
      if (!row) throw error;
      return this.repo.save(Object.assign(row, fields));
    }
  }

  private hasPendingFor(rowId: string): boolean {
    for (const request of this.pending.values()) {
      if (request.rowId === rowId) return true;
    }
    return false;
  }

  private settleRow(rowId: string, decision: UserDecision): void {
    for (const request of [...this.pending.values()]) {
      if (request.rowId === rowId) request.settle(decision);
    }
  }

  /**
   * Record the user's decision and unblock the waiting tool call. `id` is the
   * approvalId of a live prompt, or the id of a stored approval row. With
   * `allowConversation` an approval also covers every later (and currently
   * queued) request in the same conversation; with `allowTool`, every later
   * and queued call of the same tool there, whatever its input (live prompts
   * only: a stored row does not know its tool).
   */
  async decide(
    id: string,
    status:
      | AgentCommandApprovalStatus.APPROVED
      | AgentCommandApprovalStatus.REJECTED,
    workspaceId: string,
    userId: string,
    options: {
      allowConversation?: boolean;
      allowTool?: boolean;
      feedback?: string;
    } = {},
  ): Promise<AgentCommandApproval> {
    const request = this.pending.get(id);
    const live =
      request?.userId === userId && request.workspaceId === workspaceId
        ? request
        : undefined;
    const row = live
      ? await this.repo.findOne({ where: { id: live.rowId, userId } })
      : await this.findOwned(id, workspaceId, userId);
    if (!row) throw new NotFoundException('Approval not found');

    row.status = status;
    const saved = await this.repo.save(row);

    if (status === AgentCommandApprovalStatus.APPROVED) {
      // The command is now remembered as approved, so every request waiting
      // on it may go ahead
      this.settleRow(row.id, { status });
    } else if (live) {
      live.settle({ status, feedback: options.feedback });
    } else {
      this.settleRow(row.id, { status, feedback: options.feedback });
    }

    const conversationId = live?.conversationId ?? row.conversationId;
    if (status !== AgentCommandApprovalStatus.APPROVED || !conversationId) {
      return saved;
    }
    if (options.allowConversation) {
      await this.remember(AgentsApprovalsService.allKey(conversationId));
      await this.approveQueued((other) => other.conversationId === conversationId);
    } else if (options.allowTool && live?.tool) {
      const tool = live.tool;
      await this.rememberTool(conversationId, tool);
      await this.approveQueued(
        (other) =>
          other.conversationId === conversationId && other.tool === tool,
      );
    }
    return saved;
  }

  /** Approve every waiting request that `matches` and unblock it. */
  private async approveQueued(
    matches: (request: PendingRequest) => boolean,
  ): Promise<void> {
    for (const other of [...this.pending.values()]) {
      if (!matches(other)) continue;
      await this.repo.update(
        { id: other.rowId },
        { status: AgentCommandApprovalStatus.APPROVED },
      );
      other.settle({ status: AgentCommandApprovalStatus.APPROVED });
    }
  }

  async list(
    workspaceId: string,
    userId: string,
    query: GetCommandApprovalsQueryDto,
  ): Promise<GetManyBaseResponseDto<CommandApprovalResponseDto>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const where: FindOptionsWhere<AgentCommandApproval> = {
      workspaceId,
      userId,
    };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.command = ILike(`%${escapeLike(query.search)}%`);
    }

    const [rows, total] = await this.repo.findAndCount({
      where,
      // id breaks ties so rows never repeat or vanish between pages
      order: {
        [query.sortBy || 'updatedAt']: query.sortOrder || SortOrder.DESC,
        id: 'ASC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return getManyResponse({
      query: { ...query, page, limit },
      total,
      data: rows.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        toolCallId: row.toolCallId,
        command: previewCommand(row.command),
        commandTruncated: row.command.length > COMMAND_PREVIEW_LENGTH,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  }

  /**
   * Conversations were deleted: their approvals (remembered per
   * conversation) and "allow all" flags can never apply again.
   */
  async forgetConversations(
    conversationIds: string[],
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const deleted = new Set(conversationIds);
    for (const request of [...this.pending.values()]) {
      if (deleted.has(request.conversationId)) {
        request.settle({ status: AgentCommandApprovalStatus.REJECTED });
      }
    }
    // Batched: "delete all" can pass thousands of ids
    for (let i = 0; i < conversationIds.length; i += FORGET_BATCH_SIZE) {
      const batch = conversationIds.slice(i, i + FORGET_BATCH_SIZE);
      await this.repo.delete({
        workspaceId,
        userId,
        conversationId: In(batch),
      });
      try {
        await this.redis.cacheClient.del(
          ...batch.flatMap((id) => AgentsApprovalsService.conversationKeys(id)),
        );
      } catch (error) {
        // The keys expire on their own (CONVERSATION_APPROVAL_TTL_S)
        this.logger.warn(
          `Could not clear conversation approvals: ${String(error)}`,
        );
      }
    }
  }

  /** Revoking removes the remembered decision so the command asks again. */
  async revoke(id: string, workspaceId: string, userId: string): Promise<void> {
    const row = await this.findOwned(id, workspaceId, userId);
    this.settleRow(row.id, { status: AgentCommandApprovalStatus.REJECTED });
    await this.repo.remove(row);
  }

  /** "Allow all", or "allow this tool", in the conversation. */
  private async isConversationAllowed(
    conversationId: string,
    tool?: string,
  ): Promise<boolean> {
    const client = this.redis.cacheClient;
    try {
      const [all, toolAllowed] = await Promise.all([
        client.exists(AgentsApprovalsService.allKey(conversationId)),
        tool
          ? client.sismember(AgentsApprovalsService.toolsKey(conversationId), tool)
          : Promise.resolve(0),
      ]);
      return all > 0 || toolAllowed > 0;
    } catch (error) {
      // Fail closed: without Redis the user is simply asked again
      this.logger.warn(
        `Could not read conversation approvals: ${String(error)}`,
      );
      return false;
    }
  }

  private async remember(key: string): Promise<void> {
    try {
      await this.redis.cacheClient.set(
        key,
        '1',
        'EX',
        CONVERSATION_APPROVAL_TTL_S,
      );
    } catch (error) {
      // The current request is still allowed; later ones just ask again
      this.logger.warn(
        `Could not store conversation approval: ${String(error)}`,
      );
    }
  }

  private async rememberTool(
    conversationId: string,
    tool: string,
  ): Promise<void> {
    const key = AgentsApprovalsService.toolsKey(conversationId);
    try {
      await this.redis.cacheClient.sadd(key, tool);
      await this.redis.cacheClient.expire(key, CONVERSATION_APPROVAL_TTL_S);
    } catch (error) {
      // The current request is still allowed; later ones just ask again
      this.logger.warn(`Could not store tool approval: ${String(error)}`);
    }
  }

  /**
   * Forget "allow all" and allowed tools, e.g. when the approval mode
   * changes. Errors propagate so the caller never keeps running on a stale
   * approval.
   */
  async resetConversation(conversationId: string): Promise<void> {
    await this.redis.cacheClient.del(
      ...AgentsApprovalsService.conversationKeys(conversationId),
    );
  }

  private async findOwned(
    id: string,
    workspaceId: string,
    userId: string,
  ): Promise<AgentCommandApproval> {
    const row = await this.repo.findOne({ where: { id, workspaceId, userId } });
    if (!row) throw new NotFoundException('Approval not found');
    return row;
  }
}
