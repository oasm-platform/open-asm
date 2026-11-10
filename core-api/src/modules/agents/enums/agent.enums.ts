export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum MessageType {
  TEXT = 'text',
  THINKING = 'thinking',
  ERROR = 'error',
}

export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GEMINI = 'gemini',
  OPENROUTER = 'openrouter',
  ORCAROUTER = 'orcarouter',
  VERCEL = 'vercel',
  DEEPSEEK = 'deepseek',
  KILO_CODE = 'kilo_code',
  OPENCODE_GO = 'opencode_go',
  CUSTOM = 'custom',
}

/** Reasoning effort levels, lowest first (models.dev names). */
export enum ReasoningEffort {
  NONE = 'none',
  MINIMAL = 'minimal',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  XHIGH = 'xhigh',
  MAX = 'max',
}

/** Levels offered for a model that publishes none of its own. */
export const FALLBACK_REASONING_EFFORTS = [
  ReasoningEffort.LOW,
  ReasoningEffort.MEDIUM,
  ReasoningEffort.HIGH,
];

export enum SearchProvider {
  EXA = 'exa',
  FIRECRAWL = 'firecrawl',
  TINYFISH = 'tinyfish',
}

export enum SubagentStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  /** Stopped by the user before it finished; never delivered. */
  CANCELLED = 'cancelled',
}

/** When an agent definition can run: as the main agent, as a subagent or both. */
export enum AgentDefinitionMode {
  PRIMARY = 'primary',
  SUBAGENT = 'subagent',
  ALL = 'all',
}

/** Who sees an agent definition. Built-in ones come from `builtin-agents/`. */
export enum AgentDefinitionScope {
  BUILTIN = 'builtin',
  USER = 'user',
  WORKSPACE = 'workspace',
}

/** What a workspace tool rule does to the calls it matches. */
export enum AgentToolRuleAction {
  ALLOW = 'allow',
  DENY = 'deny',
  ASK = 'ask',
}
