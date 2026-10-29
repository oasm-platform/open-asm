import { tool, type Tool } from 'ai';
import type { z } from 'zod';

import { SortOrder } from '@/common/dtos/get-many-base.dto';

import type { ApprovalDecision } from '../agents.approvals';
import type { ToolCallOptions } from './types';

export interface ToolConfig {
  description: string;
  inputSchema: z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (params: any, options: ToolCallOptions) => unknown;
}

/** An AI SDK tool from a plain config, without tool()'s schema generics. */
export function defineTool(config: ToolConfig): Tool {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tool(config as any);
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Runs `action`; a throw becomes the failed answer the model reads. */
export async function failSoft<T>(
  what: string,
  action: () => Promise<T>,
): Promise<T | { success: false; message: string }> {
  try {
    return await action();
  } catch (error) {
    return {
      success: false,
      message: `Failed to ${what}: ${errorMessage(error)}`,
    };
  }
}

/** The page the model asked for, 100 rows by default. */
export const pageOf = ({ page, limit }: { page?: number; limit?: number }) => ({
  limit: limit ?? 100,
  page: page ?? 1,
});

export const NEWEST_FIRST = {
  sortBy: 'createdAt',
  sortOrder: SortOrder.DESC,
} as const;

export function rejectionMessage(what: string, feedback?: string): string {
  const base = `${what} was not approved by the user and was not executed.`;
  return feedback ? `${base} The user says: ${feedback}` : base;
}

/**
 * Agent mode works from a plan the user approved: no tool runs before one of
 * its steps is in progress. Matched by the console (chat-helpers.tsx) to show
 * the call as "Needs plan".
 */
export const TODO_REQUIRED_MESSAGE =
  'Not executed: Agent mode needs an approved plan first. Call formulate_plan with the steps (put this work in them) and wait for the user to approve it, then transition_step the first step to in_progress before calling other tools. If the plan is finished, start a new one with formulate_plan.';

/** Only Agent mode makes plans; Ask mode just answers. */
export const PLANNING_OFF_MESSAGE =
  'Not executed: planning is off in this conversation (only Agent mode makes plans). Do the work directly with the other tools, without a plan.';

export function deniedMessage(
  what: string,
  decision: ApprovalDecision,
): string {
  if (decision.todoRequired) return TODO_REQUIRED_MESSAGE;
  return rejectionMessage(what, decision.feedback);
}

/**
 * JSON with object keys sorted at every level, so the same arguments match
 * the same approval whatever order the model wrote them in.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

/** Renamed tools: saved settings and agent definitions may use the old name. */
const RENAMED_TOOLS: Readonly<Record<string, string>> = {
  run_tool: 'run_tool_connector',
  // ltm_write saves a new record each call, which is what append was for
  ltm_append: 'ltm_write',
};

export const currentToolName = (name: string): string =>
  RENAMED_TOOLS[name] ?? name;
