export const AgentType = {
  Orchestration: 0,
  NucleiGenerator: 1,
  Analysis: 2,
} as const;

export type AgentType = (typeof AgentType)[keyof typeof AgentType];
