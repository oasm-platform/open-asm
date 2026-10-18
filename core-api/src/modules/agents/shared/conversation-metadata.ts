import type { EntityManager } from 'typeorm';
import { AgentConversation } from '../entities/agent-conversation.entity';

/** Where the context window of the current model came from. */
export type ContextWindowSource = 'manual' | 'catalog' | 'default';

/** Aggregated stats of one user turn (or one subagent run). */
export interface TurnStats {
  steps: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  /** Share of input tokens served from the provider's prompt cache (0-100). */
  cachePercent: number;
  /** Time spent waiting on the model. */
  modelTimeMs: number;
  /** Step time not spent on the model call (tool execution, incl. approval waits). */
  toolTimeMs: number;
  avgTtftMs: number | null;
  /** Output tokens per second while the model was streaming tokens. */
  responseTokPerSec: number | null;
  /** Output tokens per second over the whole turn wall time. */
  turnTokPerSec: number | null;
  wallTimeMs: number;
  /** Time the turn spent waiting for background subagents (excluded from wallTimeMs). */
  subagentWaitMs: number;
  /** USD; null when the model has no known price. */
  costUsd: number | null;
}

export interface ConversationTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** False once any turn or subagent run had an unknown price. */
  costComplete: boolean;
  turns: number;
}

/** Shape of `agent_conversations.metadata`. */
export interface ConversationMetadata {
  model?: string;
  provider?: string;
  llmConfigId?: string;
  contextWindow?: number;
  contextWindowSource?: ContextWindowSource;
  /** True when the catalog match was a guess (bare model id). */
  catalogEstimated?: boolean;
  /** Tokens in the context after the last step (prompt + response). */
  contextUsedTokens?: number;
  lastTurn?: TurnStats;
  totals?: ConversationTotals;
  updatedAt?: string;
}

/** Shape of `agent_subagents.metadata`. */
export interface SubagentMetadata {
  model?: string;
  provider?: string;
  llmConfigId?: string;
  attempts?: number;
  stats?: TurnStats;
  toolsUsed?: string[];
}

export interface MetadataDelta {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  countTurn: boolean;
}

const emptyTotals = (): ConversationTotals => ({
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  costComplete: true,
  turns: 0,
});

/** Pure merge used by {@link updateConversationMetadata}. */
export function mergeConversationMetadata(
  current: ConversationMetadata | null | undefined,
  patch: Partial<Omit<ConversationMetadata, 'totals'>>,
  delta?: MetadataDelta,
  now = new Date(),
): ConversationMetadata {
  const next: ConversationMetadata = { ...(current ?? {}), ...patch };
  if (delta) {
    const totals = { ...emptyTotals(), ...(current?.totals ?? {}) };
    totals.inputTokens += delta.inputTokens;
    totals.outputTokens += delta.outputTokens;
    totals.costUsd += delta.costUsd ?? 0;
    totals.costComplete = totals.costComplete && delta.costUsd !== null;
    if (delta.countTurn) totals.turns += 1;
    next.totals = totals;
  }
  next.updatedAt = now.toISOString();
  return next;
}

/**
 * Read-modify-write of a conversation's metadata under a row lock, so turn
 * stats and background subagent totals never overwrite each other.
 *
 * @returns The new metadata, or null when the conversation no longer exists.
 */
export async function updateConversationMetadata(
  manager: EntityManager,
  conversationId: string,
  patch: Partial<Omit<ConversationMetadata, 'totals'>>,
  delta?: MetadataDelta,
): Promise<ConversationMetadata | null> {
  return manager.transaction(async (m) => {
    const row = await m.findOne(AgentConversation, {
      where: { id: conversationId },
      select: ['id', 'metadata'],
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) return null;
    const next = mergeConversationMetadata(row.metadata, patch, delta);
    await m.update(AgentConversation, { id: conversationId }, { metadata: next });
    return next;
  });
}
