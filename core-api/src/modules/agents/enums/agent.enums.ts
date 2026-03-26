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
  GEMINI = 'gemini',
  ANTHROPIC = 'anthropic',
  KILO_CODE = 'kilo_code',
  CUSTOM = 'custom',
}
