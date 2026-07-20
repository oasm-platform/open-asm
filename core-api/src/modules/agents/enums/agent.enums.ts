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
  VERCEL = 'vercel',
  DEEPSEEK = 'deepseek',
  KILO_CODE = 'kilo_code',
  OPENCODE_GO = 'opencode_go',
  CUSTOM = 'custom',
}
