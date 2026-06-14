/** All supported subagent types within the orchestrator. */
export type SubAgentType =
  | 'recon'
  | 'vuln_analysis'
  | 'execution'
  | 'report'
  | 'title_gen';

/**
 * Describes a subagent type's configuration and capabilities.
 * Each subagent definition maps a {@link SubAgentType} to its runtime
 * configuration: prompt source, allowed tools, and resource limits.
 */
export interface SubAgentDefinition {
  /** Identifier for this subagent type. */
  type: SubAgentType;
  /** Human-readable name displayed in logs and UI. */
  name: string;
  /** Short description of the subagent's responsibility. */
  description: string;
  /** Relative path to the `.md` system prompt file. */
  systemPromptPath: string;
  /** Tool names this subagent is allowed to invoke. */
  tools: string[];
  /** Maximum number of tool-call steps per invocation. */
  maxSteps: number;
  /** Optional upper bound on output tokens. */
  maxOutputTokens?: number;
  /** Optional model override (falls back to orchestrator default). */
  preferredModel?: string;
}

/**
 * Tracks the lifecycle of a single subagent invocation.
 * Maps directly to the `agent_subagent_runs` database table.
 */
export interface SubAgentRunRecord {
  /** Primary key (UUID). */
  id: string;
  /** The conversation this run belongs to. */
  conversationId: string;
  /** Optional message that triggered this run. */
  messageId?: string;
  /** Which subagent type was executed. */
  agentType: SubAgentType;
  /** Display name of the subagent. */
  agentName: string;
  /** Current lifecycle status. */
  status: SubAgentRunStatus;
  /** Description of the task given to this subagent. */
  taskDescription: string;
  /** Short text summary of the result on success. */
  resultSummary?: string;
  /** Error message when status is `failed`. */
  errorMessage?: string;
  /** Input (prompt) tokens consumed. */
  inputTokens: number;
  /** Output (completion) tokens produced. */
  outputTokens: number;
  /** Total tokens (input + output). */
  totalTokens: number;
  /** Timestamp when the subagent started executing. */
  startedAt?: Date;
  /** Timestamp when the subagent finished. */
  completedAt?: Date;
  /** Wall-clock duration in milliseconds. */
  durationMs?: number;
  /** Model identifier actually used for this run. */
  modelUsed?: string;
  /** Number of tool-call steps executed. */
  stepsExecuted: number;
  /** Names of tools invoked during this run. */
  toolsUsed: string[];
  /** Optimistic-lock version for concurrent updates. */
  version: number;
  /** Row creation timestamp. */
  createdAt: Date;
  /** Row last-update timestamp. */
  updatedAt: Date;
}

/** Lifecycle status of a subagent run. */
export type SubAgentRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Normalised return value from the subagent runner service.
 * Carries the result payload plus resource-usage metadata so the
 * orchestrator can manage budgets and report progress.
 */
export interface SubAgentResult {
  /** Whether the subagent completed without error. */
  success: boolean;
  /** Textual output produced by the subagent. */
  text: string;
  /** Number of tool-call steps executed. */
  steps: number;
  /** Token usage breakdown. */
  tokens: { input: number; output: number };
  /** Unique tool names invoked during the run. */
  toolsUsed: string[];
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}
