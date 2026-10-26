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
  OPPER = 'opper',
  VERCEL = 'vercel',
  DEEPSEEK = 'deepseek',
  KILO_CODE = 'kilo_code',
  OPENCODE_GO = 'opencode_go',
  CUSTOM = 'custom',
}

export enum ReasoningEffort {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

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
