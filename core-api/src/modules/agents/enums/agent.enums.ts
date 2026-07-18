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
  OPENROUTER = 'openrouter',
  DEEPSEEK = 'deepseek',
  GEMINI = 'gemini',
  ANTHROPIC = 'anthropic',
  KILO_CODE = 'kilo_code',
  OPENCODE_GO = 'opencode_go',
  CUSTOM = 'custom',
}
