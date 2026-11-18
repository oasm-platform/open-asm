import type { Type } from '@nestjs/common';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import type { AgentMode } from '@/modules/agents/enums/agent.enums';

import { isRenamedToolName } from './helpers';
import type {
  AgentFunctionBuildContext,
  AgentFunctionContext,
  ToolCallOptions,
} from './types';

/** How a call is reviewed before it runs. */
export type AgentFunctionGate =
  /** The guard, then the approval flow, when the run has approval settings */
  | 'approval'
  /** The function runs the guard and the approval flow itself, on its raw input */
  | 'self'
  /** Neither: it only touches the run's own state, or its caller gates it */
  | 'none';

/**
 * An option known only per run: a factory receives the run and the instance
 * of the class the function lives on. Annotate `self` with that class.
 */
type PerRun<T> = T | ((ctx: AgentFunctionBuildContext, self: never) => T);

export interface AgentFunctionOptions<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** What the model calls it by: 1-64 of A-Z a-z 0-9 _ - */
  name: string;
  /** For the model; lines of an array are joined with '\n'. */
  description: PerRun<string | string[]>;
  /** Its arguments; none when left out. */
  inputSchema?: PerRun<S>;
  /**
   * The workspace permission keys of the HTTP route serving the same data,
   * checked for the run's member before every call. `[]` = membership only;
   * 'ungated' = no membership check (tools over the run's own state).
   */
  permissions: readonly string[] | 'ungated';
  /** Only reads OASM data: the MANUAL approval mode runs it without asking. */
  readOnly?: boolean;
  /** Also served by the OASM MCP server, which has no approval flow: needs readOnly. */
  mcp?: boolean;
  /** Agent modes offering it; every mode when left out. */
  modes?: readonly AgentMode[];
  /** Default 'approval'. */
  gate?: AgentFunctionGate;
  /** Leaves the function out of a run when it returns false. */
  available?: (ctx: AgentFunctionBuildContext, self: never) => boolean;
}

const AgentFunctionMetadata =
  Reflector.createDecorator<AgentFunctionOptions>();

type AgentFunctionMethod<S extends z.ZodTypeAny> = (
  input: z.infer<S>,
  ctx: AgentFunctionContext,
) => unknown;

/**
 * Offers the method to the model as a tool. It is called with the input the
 * schema parsed and the run's context; the method's first parameter must
 * accept what the schema produces.
 */
export function AgentFunction<
  S extends z.ZodTypeAny = z.ZodObject<Record<string, never>>,
>(options: AgentFunctionOptions<S>) {
  const decorate = AgentFunctionMetadata(options as AgentFunctionOptions);
  return <M extends AgentFunctionMethod<S>>(
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<M>,
  ): void => {
    decorate(target, key, descriptor);
  };
}

/** One @AgentFunction method of a class. */
export interface AgentFunctionEntry {
  method: string;
  options: AgentFunctionOptions;
}

const reflector = new Reflector();
const scanner = new MetadataScanner();

/** The @AgentFunction methods of a class, in declaration order. */
export function agentFunctionsOf(cls: Type): AgentFunctionEntry[] {
  const prototype = cls.prototype as Record<string, unknown>;
  return scanner.getAllMethodNames(prototype).flatMap((method) => {
    const handler = prototype[method];
    const options =
      typeof handler === 'function'
        ? reflector.get(AgentFunctionMetadata, handler)
        : undefined;
    return options ? [{ method, options }] : [];
  });
}

/** Whether a run offers the function: its modes, then its own check. */
export function isOffered(
  options: AgentFunctionOptions,
  ctx: AgentFunctionBuildContext,
  self: object,
): boolean {
  if (options.modes && !(ctx.mode && options.modes.includes(ctx.mode))) {
    return false;
  }
  return !options.available || options.available(ctx, self as never);
}

function perRun<T>(
  value: PerRun<T>,
  ctx: AgentFunctionBuildContext,
  self: object,
): T {
  return typeof value === 'function'
    ? (value as (ctx: AgentFunctionBuildContext, self: never) => T)(
        ctx,
        self as never,
      )
    : value;
}

/** The function's description for this run. */
export function describeAgentFunction(
  options: AgentFunctionOptions,
  ctx: AgentFunctionBuildContext,
  self: object,
): string {
  const description = perRun(options.description, ctx, self);
  return Array.isArray(description) ? description.join('\n') : description;
}

/**
 * The AI SDK tool calling `instance[method]` with the run's context, without
 * any gate. The model's call options are optional: callers in this codebase
 * may run a tool directly.
 */
export function buildAgentFunction(
  instance: object,
  { method, options }: AgentFunctionEntry,
  ctx: AgentFunctionBuildContext,
): Tool {
  const handler = (instance as Record<string, AgentFunctionMethod<z.ZodTypeAny>>)[
    method
  ];
  const config = {
    description: describeAgentFunction(options, ctx, instance),
    inputSchema: options.inputSchema
      ? perRun(options.inputSchema, ctx, instance)
      : z.object({}),
    execute: (input: unknown, call?: Partial<ToolCallOptions>): unknown =>
      handler.call(instance, input, {
        ...ctx,
        toolCallId: call?.toolCallId ?? '',
        abortSignal: call?.abortSignal,
      }),
  };
  return tool(config as unknown as Parameters<typeof tool>[0]);
}

/** The functions of `instance` the run offers, by name, ungated. */
export function buildAgentFunctions(
  instance: object,
  ctx: AgentFunctionBuildContext,
): Record<string, Tool> {
  const cls = instance.constructor as Type;
  return Object.fromEntries(
    agentFunctionsOf(cls)
      .filter(({ options }) => isOffered(options, ctx, instance))
      .map((entry) => [
        entry.options.name,
        buildAgentFunction(instance, entry, ctx),
      ]),
  );
}

const NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Throws on the first broken rule, naming the class and method: a name the
 * model providers refuse, a name used twice, an old alias reused
 * (RENAMED_TOOLS maps it to its new name), an empty permission key, or an
 * MCP function that is not read-only or builds its schema per run.
 */
export function validateAgentFunctions(classes: readonly Type[]): void {
  const seen = new Map<string, string>();
  for (const cls of classes) {
    for (const { method, options } of agentFunctionsOf(cls)) {
      const where = `${cls.name}.${method}`;
      const fail = (reason: string): never => {
        throw new Error(`@AgentFunction ${where}: ${reason}`);
      };
      if (!NAME.test(options.name)) {
        fail(`name "${options.name}" must be 1-64 of A-Z a-z 0-9 _ -`);
      }
      const other = seen.get(options.name);
      if (other) fail(`name "${options.name}" is already used by ${other}`);
      seen.set(options.name, where);
      if (isRenamedToolName(options.name)) {
        fail(`name "${options.name}" is an old alias in RENAMED_TOOLS`);
      }
      if (
        options.permissions !== 'ungated' &&
        options.permissions.some((key) => key.trim() === '')
      ) {
        fail('permission keys must not be empty');
      }
      if (options.mcp && !options.readOnly) {
        fail('mcp: true needs readOnly: true (MCP has no approval flow)');
      }
      if (options.mcp && !(options.inputSchema === undefined || options.inputSchema instanceof z.ZodObject)) {
        fail('mcp: true needs a static z.object() inputSchema');
      }
    }
  }
}
