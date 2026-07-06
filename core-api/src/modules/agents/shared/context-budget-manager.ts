import { TokenCounter } from './token-counter';

const OUTPUT_RESERVE_RATIO = 0.3;
const COMPACTION_THRESHOLD_RATIO = 0.6;
const PRUNING_THRESHOLD_RATIO = 0.8;
const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Budget breakdown for a context window.
 */
export interface ContextBudget {
  /** Total token budget for the context window. */
  totalTokens: number;
  /** Tokens reserved for model output (30% of total). */
  outputReserve: number;
  /** Tokens available for input (total - outputReserve). */
  availableForInput: number;
  /** Token count at which compaction should trigger (60% of total). */
  compactionThreshold: number;
  /** Token count at which pruning should trigger (80% of total). */
  pruningThreshold: number;
}

/**
 * Result of checking whether context fits within budget.
 */
export interface BudgetCheckResult {
  /** Whether the context fits within the available budget. */
  fits: boolean;
  /** Estimated tokens used by system context parts. */
  systemTokens: number;
  /** Estimated tokens used by conversation history. */
  historyTokens: number;
  /** Total estimated tokens across all context. */
  totalTokens: number;
  /** The budget breakdown used for this check. */
  budget: ContextBudget;
  /** Whether compaction should be triggered (total >= compactionThreshold). */
  needsCompaction: boolean;
  /** Whether pruning should be triggered (total >= pruningThreshold). */
  needsPruning: boolean;
}

/**
 * Recommended pruning strategy when context exceeds budget.
 */
export interface PruningStrategy {
  /** Maximum number of messages to keep in history. */
  maxMessages: number;
  /** Whether to always retain system context. */
  keepSystemContext: boolean;
  /** Whether to retain summary if one exists. */
  keepSummary: boolean;
  /** Whether to strip tool call/result details from messages. */
  pruneToolDetails: boolean;
  /** Whether to remove oldest messages first when pruning. */
  removeOldestFirst: boolean;
}

/**
 * ContextBudgetManager encapsulates token budget logic for AI agent context management.
 *
 * Provides budget calculation, usage checking, and pruning strategy recommendations
 * to support mid-loop compaction decisions.
 */
export class ContextBudgetManager {
  /**
   * Calculates a token budget breakdown for the given context window size.
   *
   * @param contextWindow - Total token capacity of the model. Defaults to 128k.
   * @returns Budget breakdown with thresholds for compaction and pruning.
   */
  static calculateBudget(contextWindow: number = DEFAULT_CONTEXT_WINDOW): ContextBudget {
    const total = Math.max(0, contextWindow);
    const outputReserve = Math.floor(total * OUTPUT_RESERVE_RATIO);
    const availableForInput = total - outputReserve;
    const compactionThreshold = Math.floor(total * COMPACTION_THRESHOLD_RATIO);
    const pruningThreshold = Math.floor(total * PRUNING_THRESHOLD_RATIO);

    return {
      totalTokens: total,
      outputReserve,
      availableForInput,
      compactionThreshold,
      pruningThreshold,
    };
  }

  /**
   * Checks whether the provided context parts and conversation history
   * fit within the token budget.
   *
   * @param contextParts - System context strings (e.g. system prompt, tool definitions).
   * @param modelMessages - Conversation history as role/content pairs.
   * @param contextWindow - Total token capacity of the model.
   * @returns Budget check result with token counts and compaction/pruning flags.
   */
  static checkBudget(
    contextParts: string[],
    modelMessages: Array<{ role: string; content: string }>,
    contextWindow: number = DEFAULT_CONTEXT_WINDOW,
  ): BudgetCheckResult {
    const budget = ContextBudgetManager.calculateBudget(contextWindow);

    const safeParts = contextParts ?? [];
    const safeMessages = modelMessages ?? [];

    const systemTokens = TokenCounter.estimateParts(safeParts);
    const historyTokens = safeMessages.reduce(
      (sum, msg) => sum + TokenCounter.estimate(msg.content ?? ''),
      0,
    );
    const totalTokens = systemTokens + historyTokens;

    return {
      fits: totalTokens <= budget.availableForInput,
      systemTokens,
      historyTokens,
      totalTokens,
      budget,
      needsCompaction: totalTokens >= budget.compactionThreshold,
      needsPruning: totalTokens >= budget.pruningThreshold,
    };
  }

  /**
   * Returns a pruning strategy recommendation based on current context usage.
   *
   * As context approaches budget limits, progressively more aggressive
   * pruning strategies are recommended.
   *
   * @param contextParts - System context strings.
   * @param modelMessages - Conversation history as role/content pairs.
   * @param contextWindow - Total token capacity of the model.
   * @returns Pruning strategy with recommended parameters.
   */
  static getPruningStrategy(
    contextParts: string[],
    modelMessages: Array<{ role: string; content: string }>,
    contextWindow: number = DEFAULT_CONTEXT_WINDOW,
  ): PruningStrategy {
    const check = ContextBudgetManager.checkBudget(contextParts, modelMessages, contextWindow);
    const totalMessages = modelMessages?.length ?? 0;
    const ratio = check.totalTokens / check.budget.availableForInput;

    // Baseline: keep all messages if well within budget
    if (ratio < COMPACTION_THRESHOLD_RATIO) {
      return {
        maxMessages: totalMessages,
        keepSystemContext: true,
        keepSummary: true,
        pruneToolDetails: false,
        removeOldestFirst: false,
      };
    }

    // Approaching compaction threshold: start light pruning
    if (ratio < PRUNING_THRESHOLD_RATIO) {
      return {
        maxMessages: Math.max(10, Math.floor(totalMessages * 0.7)),
        keepSystemContext: true,
        keepSummary: true,
        pruneToolDetails: false,
        removeOldestFirst: true,
      };
    }

    // At or beyond pruning threshold: aggressive pruning
    return {
      maxMessages: Math.max(5, Math.floor(totalMessages * 0.4)),
      keepSystemContext: true,
      keepSummary: true,
      pruneToolDetails: true,
      removeOldestFirst: true,
    };
  }
}
