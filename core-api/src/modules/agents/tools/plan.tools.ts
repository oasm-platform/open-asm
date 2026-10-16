import type { Tool } from 'ai';
import { Logger } from '@nestjs/common';
import type { EventEmitter } from 'node:events';
import { z } from 'zod';

import { AgentApprovalMode } from '@/common/enums/enum';

import type { ApprovalSettings, PlanRunMode } from '../agents.approvals';
import type { AgentTodoItem } from '../agents.todo';
import { AgentConversationTodo } from '../entities/agent-conversation-todo.entity';
import {
  PLANNING_OFF_MESSAGE,
  defineTool,
  errorMessage,
  failSoft,
  rejectionMessage,
} from './helpers';
import type { Deps, ToolCallOptions } from './types';

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

/**
 * Plan tools. With `plan.approval` in PLAN mode, formulate_plan shows the
 * new plan to the user and waits for them to approve it, choosing whether
 * the rest of the run asks per command (MANUAL) or not (AUTO). Outside
 * PLAN mode formulate_plan and append_step refuse: only transition_step and
 * scrap_plan remain, to finish or drop a plan approved earlier.
 */
export function planTools(
  deps: PlanDeps,
  conversationId: string,
  emitter?: EventEmitter,
  plan?: { workspaceId: string; approval: ApprovalSettings },
): Record<string, Tool> {
  const todoRepo = deps.todoRepository;

  const findTodos = () =>
    todoRepo.find({ where: { conversationId }, order: { sortOrder: 'ASC' } });

  const emitTodos = async (): Promise<void> => {
    if (emitter) {
      const todos = await findTodos();
      emitter.emit('todos-updated', todos.map(toTodoItem));
    }
  };

  // Read at call time: approving a plan switches the run out of PLAN mode,
  // and the plan it approved is the last one this run may make
  const planningAllowed = () =>
    !plan || plan.approval.mode === AgentApprovalMode.PLAN;

  const formulatePlan = defineTool({
    description:
      'Set/reset execution plan with step array. Params: steps (string[]). Output: success, message, todos. ONLY call this when no active plan exists (all steps completed/failed, or plan is empty). If a plan is already in progress, you MUST execute existing steps — do NOT call this tool.',
    inputSchema: z.object({
      steps: z.array(z.string().min(1)).min(1).describe('Plan steps'),
    }),
    execute: async (
      params: { steps: string[] },
      options?: Partial<ToolCallOptions>,
    ) => {
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

        // Replace the old plan atomically: a failed insert must not leave
        // the conversation with no plan at all
        await todoRepo.manager.transaction(async (manager) => {
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
        emitter?.emit('todos-updated', todos);

        if (plan?.approval.mode === AgentApprovalMode.PLAN) {
          const decision = await deps.approvals.requestPlanApproval(
            steps,
            options?.toolCallId ?? '',
            {
              ...plan.approval,
              workspaceId: plan.workspaceId,
              conversationId,
            },
            emitter,
            options?.abortSignal,
          );
          if (!decision.allowed) {
            await todoRepo.delete({ conversationId });
            await emitTodos();
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
            deps,
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
              ' Start with step 1 now.',
            todos,
          };
        }

        return {
          success: true,
          message: `Plan set with ${todos.length} steps.`,
          todos,
        };
      } catch (error) {
        const message = errorMessage(error);
        logger.error(`[formulate_plan] Error: ${message}`);
        return { success: false, message: `Failed to set plan: ${message}` };
      }
    },
  });

  const transitionStep = defineTool({
    description:
      'Update the status of a specific step in the execution plan. You MUST call this at two points: (1) BEFORE starting work on a step — call transition_step(id, "in_progress"), and (2) AFTER finishing work on a step — call transition_step(id, "completed") or transition_step(id, "failed"). ALWAYS transition the current step before moving to the next sequential step. NEVER skip steps. NEVER call this for a step that is not your current step. Params: id (UUID of the step), status (pending/in_progress/completed/failed).',
    inputSchema: z.object({
      id: z.string().uuid().describe('Todo item ID'),
      status: z
        .enum(['pending', 'in_progress', 'completed', 'failed'])
        .describe('New status'),
    }),
    execute: (params: { id: string; status: AgentTodoItem['status'] }) =>
      failSoft('update step', async () => {
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
        await todoRepo.save(target);

        await emitTodos();
        return {
          success: true,
          message: `Updated "${target.content}" -> ${params.status}`,
          todo: toTodoItem(target),
        };
      }),
  });

  const appendStep = defineTool({
    description:
      'Append a new step to the plan. Params: content (string). ONLY use when you genuinely discover a new requirement during execution that was not part of the original plan. Do NOT use to re-create steps you forgot to add earlier — finish the current step first.',
    inputSchema: z.object({
      content: z.string().min(1).describe('Todo content'),
    }),
    execute: async (params: { content: string }) => {
      // An approved plan is a contract: no unreviewed steps after the fact
      if (!planningAllowed()) {
        return { success: false, message: PLANNING_OFF_MESSAGE };
      }
      return failSoft('add step', async () => {
        const todos = await todoRepo.find({ where: { conversationId } });

        // Guard: warn but allow append during active plan (the LLM might genuinely need it)
        const active = todos.filter(isActive).length;
        if (active > 0) {
          logger.warn(
            `[append_step] Adding step while ${active} step(s) still active`,
          );
        }

        const newEntity = todoRepo.create({
          conversationId,
          content: params.content,
          status: 'pending',
          sortOrder: Math.max(-1, ...todos.map((t) => t.sortOrder)) + 1,
        });
        await todoRepo.save(newEntity);

        await emitTodos();
        return {
          success: true,
          message: `Added todo "${params.content}".`,
          todo: toTodoItem(newEntity),
        };
      });
    },
  });

  const scrapPlan = defineTool({
    description:
      'Clear entire plan (irreversible). Then call formulate_plan to create a new one.',
    inputSchema: z.object({}),
    execute: () =>
      failSoft('clear plan', async () => {
        await todoRepo.delete({ conversationId });
        await emitTodos();
        return { success: true, message: 'Plan cleared.' };
      }),
  });

  return {
    formulate_plan: formulatePlan,
    transition_step: transitionStep,
    append_step: appendStep,
    scrap_plan: scrapPlan,
  };
}
