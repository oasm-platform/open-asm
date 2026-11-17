import type { Type } from '@nestjs/common';
import type { Tool } from 'ai';

import { AgentTool } from './agents.tools';
import {
  agentFunctionsOf,
  buildAgentFunction,
  buildAgentFunctions,
} from './tools/agent-function';
import type { AgentFunctionBuildContext } from './tools/types';

// Spec helpers: tool classes over plain service mocks. Every class names a
// service the same way (ToolServices), so one bag of mocks fits them all.

/** An instance of `cls` whose injected properties are `services`. */
export function withServices<T extends object>(
  cls: Type<T>,
  services: object,
): T {
  const instance = Object.create(cls.prototype as object) as T;
  return Object.assign(instance, services);
}

/** An AgentTool whose gates and tool classes all read `services`. */
export function agentToolWith(services: object = {}): AgentTool {
  const instances = new Map<Type, unknown>();
  const moduleRef = {
    get: (cls: Type) => {
      if (!instances.has(cls)) instances.set(cls, withServices(cls, services));
      return instances.get(cls);
    },
  };
  return Object.assign(withServices(AgentTool, services), { moduleRef });
}

/** The agent functions of `cls` over `services`, ungated, by name. */
export function agentFunctionsWith(
  cls: Type,
  services: object,
  ctx: Partial<AgentFunctionBuildContext> = {},
): Record<string, Tool> {
  return buildAgentFunctions(withServices(cls, services), {
    workspaceId: 'w1',
    ...ctx,
  });
}

/** One agent function of `cls` over `services`, ungated, in a run of `ctx`. */
export function agentFunctionWith(
  cls: Type,
  name: string,
  services: object,
  ctx: Partial<AgentFunctionBuildContext> = {},
): Tool {
  const entry = agentFunctionsOf(cls).find((e) => e.options.name === name);
  if (!entry) throw new Error(`${cls.name} has no agent function ${name}`);
  return buildAgentFunction(withServices(cls, services), entry, {
    workspaceId: 'w1',
    ...ctx,
  });
}
