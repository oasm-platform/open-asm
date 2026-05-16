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
  MISTRAL = 'mistral',
  COHERE = 'cohere',
  KILO_CODE = 'kilo_code',
  CUSTOM = 'custom',
}

export enum SkillStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum EmbeddingProvider {
  OPENAI = 'openai',
  GEMINI = 'gemini',
  MISTRAL = 'mistral',
  COHERE = 'cohere',
  CUSTOM = 'custom',
}
