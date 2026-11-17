import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EventEmitter } from 'node:events';
import { Repository } from 'typeorm';
import { z } from 'zod';

import { AgentApprovalMode } from '@/common/enums/enum';

import {
  AgentsApprovalsService,
  type ApprovalSettings,
  type PlanRunMode,
} from '../agents.approvals';
import type { AgentTodoItem } from '../agents.todo';
import { AgentConversationTodo } from '../entities/agent-conversation-todo.entity';
import { AgentConversation } from '../entities/agent-conversation.entity';
import { updateConversationMetadata } from '../shared/conversation-metadata';
import { AgentFunction } from './agent-function';
import {
  PLANNING_OFF_MESSAGE,
  errorMessage,
  failSoft,
  rejectionMessage,
} from './helpers';
import type { AgentFunctionContext, Deps } from './types';

const logger = new Logger('AgentTool');

/** Longer plans are rarely followed through and bloat every system prompt. */
const MAX_PLAN_STEPS = 20;

const isActive = (todo: Pick<AgentConversationTodo, 'status'>) =>
  todo.status === 'pending' || todo.status === 'in_progress';

const toTodoItem = (todo: AgentConversationTodo): AgentTodoItem => ({
  id: todo.id,
  content: todo.content,
  status: todo.status,
  sortOrder: todo.sortOrder,
  updatedAt: todo.updatedAt.toISOString(),
});

/**
 * Tries to parse a string as a JSON array with fallback strategies.
 * Handles cases where LLM sends steps with invalid JSON escapes (e.g., \`)
 * that cause JSON.parse to fail.
 *
 * Strategy:
 * 1. Normal JSON.parse
 * 2. Sanitize invalid escapes and retry
 * 3. Regex extraction for ["...", "..."] patterns
 */
function tryParseJsonArray(str: string): string[] | null {
  // Strategy 1: Normal JSON.parse
  // Strategy 2: Sanitize invalid escapes and retry
  // Common issue: LLM sends \` which is not valid JSON
  for (const candidate of [str, str.replace(/\\`/g, '`')]) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return Array.isArray(parsed) ? parsed.map((s) => String(s)) : null;
    } catch {
      // Fall through
    }
  }

  // Strategy 3: Regex extraction for ["...", "..."] pattern
  const trimmed = str.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1);
  const items: string[] = [];
  let current = '';
  let inQuote = false;
  let escaped = false;

  for (const ch of inner) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      current += ch;
      continue;
    }
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (ch === ',' && !inQuote) {
      const trimmedItem = current.trim();
      if (trimmedItem) items.push(trimmedItem);
      current = '';
      continue;
    }
    current += ch;
  }
  const lastItem = current.trim();
  if (lastItem) items.push(lastItem);
  if (items.length === 0) return null;

  // Clean up escaped quotes in each item
  return items.map((s) => s.replace(/^"|"$/g, '').replace(/\\"/g, '"').trim());
}

function cleanStep(s: string): string {
  let cleaned = s.trim();
  // Remove surrounding quotes (single or double)
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Remove escaped quotes
  cleaned = cleaned.replace(/\\"/g, '"').replace(/\\'/g, "'");
  // Remove extra whitespace but preserve intentional newlines
  return cleaned.replace(/[ \t]+/g, ' ').trim();
}

/** Normalize steps: handle various formats AI might send */
function normalizeSteps(rawSteps: string[] | string): string[] {
  let stepsArray: unknown[] = [];

  if (typeof rawSteps === 'string') {
    const parsed = tryParseJsonArray(rawSteps);
    if (parsed) {
      stepsArray = parsed;
      logger.debug('[formulate_plan] Parsed from JSON string');
    } else {
      stepsArray = [rawSteps];
    }
  } else if (Array.isArray(rawSteps)) {
    const parsed =
      rawSteps.length === 1 && typeof rawSteps[0] === 'string'
        ? tryParseJsonArray(rawSteps[0])
        : null;
    if (parsed) {
      stepsArray = parsed;
      logger.debug('[formulate_plan] Parsed from nested JSON string');
    } else {
      stepsArray = rawSteps;
    }
  }

  const steps: string[] = [];
  for (const s of stepsArray) {
    if (typeof s === 'string') {
      const cleaned = cleanStep(s);
      if (!cleaned) continue;
      // Split by newline in case AI puts all steps in one string
      if (cleaned.includes('\n')) {
        steps.push(
          ...cleaned
            .split('\n')
            .map(cleanStep)
            .filter((l) => l.length > 0),
        );
      } else {
        steps.push(cleaned);
      }
    } else if (typeof s === 'object' && s !== null) {
      steps.push(JSON.stringify(s));
    } else if (s !== null && s !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const cleaned = cleanStep(String(s));
      if (cleaned) steps.push(cleaned);
    }
  }
  return steps;
}

type PlanDeps = Deps<'todoRepository' | 'approvals' | 'conversationRepository'>;

/**
 * Apply the approval mode the user picked for an approved plan: to the
 * running tools (they read `approval` at call time), the conversation
 * (later turns) and the client's mode selector.
 */
async function switchApprovalMode(
  deps: PlanDeps,
  conversationId: string,
  approval: ApprovalSettings,
  mode: PlanRunMode,
  emitter?: EventEmitter,
): Promise<void> {
  // "allow all" belonged to the previous mode
  await deps.approvals.resetConversation(conversationId);
  await deps.conversationRepository.update(conversationId, {
    approvalMode: mode,
  });
  approval.mode = mode;
  emitter?.emit('approval-mode-changed', { mode });
}


const formulatePlanInput = z.object({
  goal: z
    .string()
    .max(1000)
    .optional()
    .describe(
      'Optional: a corrected goal (outcome + success criterion). Omit to keep the auto-generated one.',
    ),
  steps: z.array(z.string().min(1)).min(1).describe('Plan steps'),
});

const transitionStepInput = z.object({
  id: z.string().uuid().describe('Todo item ID'),
  status: z
    .enum(['pending', 'in_progress', 'completed', 'failed'])
    .describe('New status'),
});

const appendStepInput = z.object({
  content: z.string().min(1).describe('Todo content'),
});

/**
 * Plan tools. With `ctx.plan.selfManaged` (Agent mode) the agent keeps its
 * own plan: formulate_plan shows each new plan to the user and waits for them
 * to approve it, choosing whether the run asks per command (MANUAL) or not
 * (AUTO); while it runs, append_step extends it without another review.
 * Otherwise formulate_plan and append_step refuse: only transition_step and
 * scrap_plan remain, to finish or drop a plan left from Agent mode. Without
 * `ctx.plan` (no run settings) plans are set without review. The plan's goal
 * is pinned in the conversation metadata until the plan is replaced or
 * dropped. They touch only the conversation's own plan: ungated.
 */
@Injectable()
export class PlanTools {
  constructor(
    @InjectRepository(AgentConversationTodo)
    readonly todoRepository: Repository<AgentConversationTodo>,
    readonly approvals: AgentsApprovalsService,
    @InjectRepository(AgentConversation)
    readonly conversationRepository: Repository<AgentConversation>,
  ) {}

  /** The conversation's plan, as each tool reads and writes it. */
  private planOf(ctx: AgentFunctionContext) {
    const conversationId = ctx.conversationId ?? '';
    const { emitter, plan } = ctx;
    const findTodos = () =>
      this.todoRepository.find({
        where: { conversationId },
        order: { sortOrder: 'ASC' },
      });
    return {
      conversationId,
      findTodos,
      pinGoal: (goal: string | null) =>
        updateConversationMetadata(
          this.conversationRepository.manager,
          conversationId,
          { goal },
        ),
      /** `goal` is sent only when it changed (null: unpinned) */
      emitTodos: async (goal?: string | null): Promise<void> => {
        if (emitter) {
          const todos = await findTodos();
          emitter.emit('todos-updated', todos.map(toTodoItem), goal);
        }
      },
      planningAllowed: () => !plan || !!plan.selfManaged,
    };
  }

  @AgentFunction({
    name: 'formulate_plan',
    description:
      'Set the execution plan (todo list) before starting the work; in Agent mode the user reviews and approves it before it runs. Params: steps (string[]); goal (string, OPTIONAL). The goal is generated for you from the request and pinned in your context already — pass goal only to correct it. Output: success, message, goal, todos. ONLY call this when no active plan exists (all steps completed/failed, or plan is empty). If a plan is already in progress, you MUST execute existing steps — do NOT call this tool.',
    inputSchema: formulatePlanInput,
    permissions: 'ungated',
    gate: 'none',
  })
  async formulatePlan(
    params: z.infer<typeof formulatePlanInput>,
    ctx: AgentFunctionContext,
  ) {
    const { emitter, plan } = ctx;
    const { conversationId, findTodos, pinGoal, emitTodos, planningAllowed } =
      this.planOf(ctx);
    if (!planningAllowed()) {
      return { success: false, message: PLANNING_OFF_MESSAGE };
    }
    try {
      // Guard: reject if there are active (pending/in_progress) todos
      const active = (await findTodos()).filter(isActive);
      if (active.length > 0) {
        const activeSteps = active
          .map((t) => `  - [${t.status}] ${t.content}`)
          .join('\n');
        return {
          success: false,
          message:
            `REJECTED: A plan is already in progress with ${active.length} pending step(s).\n` +
            `Active steps:\n${activeSteps}\n\n` +
            'You MUST execute the existing steps first. Do NOT create a new plan while steps are pending. ' +
            'Use transition_step(id, "in_progress") to start the first pending step.',
        };
      }

      logger.debug('[formulate_plan] Raw params: ' + JSON.stringify(params));

      const steps = normalizeSteps(params.steps);
      if (steps.length === 0) {
        return { success: false, message: 'No valid steps provided.' };
      }
      if (steps.length > MAX_PLAN_STEPS) {
        return {
          success: false,
          message: `Too many steps (${steps.length}). Keep the plan to at most ${MAX_PLAN_STEPS} steps by merging related work.`,
        };
      }

      // The goal is usually generated for the turn and already pinned; only
      // a goal the agent passes here overrides it. `undefined` means "keep
      // the current (auto-generated) goal", so the UI is not told it changed.
      const override = params.goal?.trim() || null;
      const goal = override ?? undefined;
      if (override) await pinGoal(override);

      // Replace the old plan atomically: a failed insert must not leave
      // the conversation with no plan at all
      await this.todoRepository.manager.transaction(async (manager) => {
        const repo = manager.getRepository(AgentConversationTodo);
        await repo.delete({ conversationId });
        await repo.save(
          steps.map((step, index) =>
            repo.create({
              conversationId,
              content: step,
              status: 'pending' as const,
              sortOrder: index,
            }),
          ),
        );
      });

      const todos = (await findTodos()).map(toTodoItem);
      logger.debug(
        `[formulate_plan] Plan set with ${todos.length} steps for ${conversationId}`,
      );

      // Show the plan right away, also while the user reviews it
      emitter?.emit('todos-updated', todos, goal);

      if (plan?.selfManaged) {
        const decision = await this.approvals.requestPlanApproval(
          steps,
          ctx.toolCallId,
          {
            ...plan.approval,
            workspaceId: plan.workspaceId,
            conversationId,
          },
          emitter,
          ctx.abortSignal,
        );
        if (!decision.allowed) {
          await this.todoRepository.delete({ conversationId });
          await pinGoal(null);
          await emitTodos(null);
          return {
            success: false,
            error: rejectionMessage('The plan', decision.feedback),
            message: decision.feedback
              ? 'The plan was discarded. Revise it following what the user said, then call formulate_plan again.'
              : 'The plan was discarded. Do not run it; ask the user how they want to proceed.',
          };
        }
        const mode = decision.mode ?? AgentApprovalMode.MANUAL;
        await switchApprovalMode(
          this,
          conversationId,
          plan.approval,
          mode,
          emitter,
        );
        return {
          success: true,
          message:
            `The user approved this ${todos.length}-step plan` +
            (mode === AgentApprovalMode.AUTO
              ? ' and lets it run without asking.'
              : '; each command still asks for approval.') +
            ' Call transition_step(id, "in_progress") on step 1 and start it now.',
          goal,
          todos,
        };
      }

      return {
        success: true,
        message:
          `Plan set with ${todos.length} steps` +
          (goal ? ' and its goal pinned' : '') +
          '. Call transition_step(id, "in_progress") on step 1 and start it now.',
        goal,
        todos,
      };
    } catch (error) {
      const message = errorMessage(error);
      logger.error(`[formulate_plan] Error: ${message}`);
      return { success: false, message: `Failed to set plan: ${message}` };
    }
  }

  @AgentFunction({
    name: 'transition_step',
    description:
      'Update the status of a specific step in the execution plan. You MUST call this at two points: (1) BEFORE starting work on a step — call transition_step(id, "in_progress"), and (2) AFTER finishing work on a step — call transition_step(id, "completed") or transition_step(id, "failed"). ALWAYS transition the current step before moving to the next sequential step. NEVER skip steps. NEVER call this for a step that is not your current step. Params: id (UUID of the step), status (pending/in_progress/completed/failed).',
    inputSchema: transitionStepInput,
    permissions: 'ungated',
    gate: 'none',
  })
  transitionStep(
    params: z.infer<typeof transitionStepInput>,
    ctx: AgentFunctionContext,
  ) {
    const { findTodos, emitTodos } = this.planOf(ctx);
    return failSoft('update step', async () => {
      // One read for the step and the ordering guard around it
      const todos = await findTodos();
      const target = todos.find((t) => t.id === params.id);
      if (!target) {
        return { success: false, message: `Todo "${params.id}" not found.` };
      }

      // Server-side ordering guard: enforce sequential execution
      if (params.status === 'in_progress') {
        // Only the first pending/in_progress step (by sortOrder) may be started
        const currentStep = todos.find(isActive);
        if (currentStep && currentStep.id !== target.id) {
          return {
            success: false,
            message: `REJECTED: Cannot start "${target.content}" (sortOrder ${target.sortOrder}). You must complete the current step first: "${currentStep.content}" (sortOrder ${currentStep.sortOrder}). Execute steps in strict sequential order.`,
          };
        }
      } else if (
        (params.status === 'completed' || params.status === 'failed') &&
        // Can only complete/fail a step that is currently in_progress
        target.status !== 'in_progress'
      ) {
        return {
          success: false,
          message: `REJECTED: Cannot mark "${target.content}" as ${params.status}. It is currently "${target.status}". Call transition_step(id, "in_progress") before completing or failing a step.`,
        };
      }

      target.status = params.status;
      await this.todoRepository.save(target);

      await emitTodos();
      return {
        success: true,
        message: `Updated "${target.content}" -> ${params.status}`,
        todo: toTodoItem(target),
      };
    });
  }

  @AgentFunction({
    name: 'append_step',
    description:
      'Append a new step to the plan. Params: content (string). ONLY use when you genuinely discover a new requirement during execution that was not part of the original plan. Do NOT use to re-create steps you forgot to add earlier — finish the current step first.',
    inputSchema: appendStepInput,
    permissions: 'ungated',
    gate: 'none',
  })
  async appendStep(
    params: z.infer<typeof appendStepInput>,
    ctx: AgentFunctionContext,
  ) {
    const { conversationId, emitTodos, planningAllowed } = this.planOf(ctx);
    if (!planningAllowed()) {
      return { success: false, message: PLANNING_OFF_MESSAGE };
    }
    return failSoft('add step', async () => {
      const todos = await this.todoRepository.find({ where: { conversationId } });

      const active = todos.filter(isActive).length;
      // Extends the approved plan while it runs; new work after it is a
      // new plan, which the user reviews
      if (ctx.plan?.selfManaged && active === 0) {
        return {
          success: false,
          message:
            'REJECTED: No plan is running. Call formulate_plan with this work as a new plan; the user reviews it before it runs.',
        };
      }
      // Guard: warn but allow append during active plan (the LLM might genuinely need it)
      if (active > 0) {
        logger.warn(
          `[append_step] Adding step while ${active} step(s) still active`,
        );
      }

      const newEntity = this.todoRepository.create({
        conversationId,
        content: params.content,
        status: 'pending',
        sortOrder: Math.max(-1, ...todos.map((t) => t.sortOrder)) + 1,
      });
      await this.todoRepository.save(newEntity);

      await emitTodos();
      return {
        success: true,
        message: `Added todo "${params.content}".`,
        todo: toTodoItem(newEntity),
      };
    });
  }

  @AgentFunction({
    name: 'scrap_plan',
    description:
      'Clear entire plan and its pinned goal (irreversible). Then call formulate_plan to create a new one.',
    permissions: 'ungated',
    gate: 'none',
  })
  scrapPlan(_params: Record<string, never>, ctx: AgentFunctionContext) {
    const { conversationId, pinGoal, emitTodos } = this.planOf(ctx);
    return failSoft('clear plan', async () => {
      await this.todoRepository.delete({ conversationId });
      await pinGoal(null);
      await emitTodos(null);
      return { success: true, message: 'Plan cleared.' };
    });
  }
}
