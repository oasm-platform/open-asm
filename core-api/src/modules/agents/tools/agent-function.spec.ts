import { AgentMode } from '@/common/enums/enum';
import { z } from 'zod';

import {
  AgentFunction,
  agentFunctionsOf,
  buildAgentFunction,
  buildAgentFunctions,
  isOffered,
  validateAgentFunctions,
} from './agent-function';
import type { AgentFunctionContext } from './types';

const nameInput = z.object({ name: z.string() });

class SampleTools {
  readonly greeting = 'hello';

  @AgentFunction({
    name: 'say_hello',
    description: ['Says hello.', 'Params: name.'],
    inputSchema: nameInput,
    permissions: ['asset.read'],
    readOnly: true,
    mcp: true,
  })
  sayHello({ name }: z.infer<typeof nameInput>, ctx: AgentFunctionContext) {
    return { text: `${this.greeting} ${name}`, ctx };
  }

  /** Not a tool: no decorator */
  helper() {
    return 'helper';
  }

  @AgentFunction({
    name: 'agent_only',
    description: (ctx, self: SampleTools) => `${self.greeting} from ${ctx.workspaceId}`,
    inputSchema: (_ctx, self: SampleTools) =>
      z.object({ word: z.enum([self.greeting]) }),
    permissions: [],
    modes: [AgentMode.AGENT],
    available: (ctx) => !!ctx.conversationId,
  })
  agentOnly() {
    return 'ok';
  }
}

const run = { workspaceId: 'w1', userId: 'u1', mode: AgentMode.AGENT, conversationId: 'c1' };

describe('@AgentFunction', () => {
  it('lists the decorated methods in declaration order, with their options', () => {
    const entries = agentFunctionsOf(SampleTools);
    expect(entries.map((e) => [e.method, e.options.name])).toEqual([
      ['sayHello', 'say_hello'],
      ['agentOnly', 'agent_only'],
    ]);
    expect(entries[0].options).toMatchObject({
      permissions: ['asset.read'],
      readOnly: true,
      mcp: true,
    });
  });

  it('calls the method on its instance with the input and the run context', async () => {
    const [entry] = agentFunctionsOf(SampleTools);
    const tool = buildAgentFunction(new SampleTools(), entry, run);
    const controller = new AbortController();

    const result = (await tool.execute!(
      { name: 'Ann' },
      { toolCallId: 't1', messages: [], abortSignal: controller.signal },
    )) as { text: string; ctx: AgentFunctionContext };

    expect(result.text).toBe('hello Ann');
    expect(result.ctx).toMatchObject({
      ...run,
      toolCallId: 't1',
      abortSignal: controller.signal,
    });
  });

  it('runs without call options, as code that calls a tool directly does', async () => {
    const [entry] = agentFunctionsOf(SampleTools);
    const tool = buildAgentFunction(new SampleTools(), entry, run);
    const execute = tool.execute as unknown as (input: unknown) => Promise<{
      ctx: AgentFunctionContext;
    }>;

    expect((await execute({ name: 'Ann' })).ctx.toolCallId).toBe('');
  });

  it('joins a description array and builds per-run options from the instance', () => {
    const tools = buildAgentFunctions(new SampleTools(), run);
    expect(tools.say_hello.description).toBe('Says hello.\nParams: name.');
    expect(tools.agent_only.description).toBe('hello from w1');
    const schema = tools.agent_only.inputSchema as z.ZodTypeAny;
    expect(schema.safeParse({ word: 'hello' }).success).toBe(true);
    expect(schema.safeParse({ word: 'bye' }).success).toBe(false);
  });

  it('offers a function only in its modes and when it is available', () => {
    const [, agentOnly] = agentFunctionsOf(SampleTools);
    const self = new SampleTools();
    expect(isOffered(agentOnly.options, run, self)).toBe(true);
    expect(isOffered(agentOnly.options, { ...run, mode: AgentMode.ASK }, self)).toBe(false);
    expect(isOffered(agentOnly.options, { workspaceId: 'w1' }, self)).toBe(false);
    expect(isOffered(agentOnly.options, { ...run, conversationId: '' }, self)).toBe(false);
    expect(Object.keys(buildAgentFunctions(self, { workspaceId: 'w1' }))).toEqual([
      'say_hello',
    ]);
  });
});

describe('validateAgentFunctions', () => {
  it('accepts valid functions', () => {
    expect(() => validateAgentFunctions([SampleTools])).not.toThrow();
  });

  it.each(['bad name', '', 'x'.repeat(65)])('refuses the name %j', (name) => {
    class Bad {
      @AgentFunction({ name, description: 'x', permissions: [] })
      run() {}
    }
    expect(() => validateAgentFunctions([Bad])).toThrow('Bad.run');
  });

  it('refuses a name two functions use, naming both', () => {
    class Again {
      @AgentFunction({ name: 'say_hello', description: 'x', permissions: [] })
      again() {}
    }
    expect(() => validateAgentFunctions([SampleTools, Again])).toThrow(
      /Again\.again.*SampleTools\.sayHello/,
    );
  });

  it('refuses an old name kept in RENAMED_TOOLS', () => {
    class Renamed {
      @AgentFunction({ name: 'run_tool', description: 'x', permissions: [] })
      run() {}
    }
    expect(() => validateAgentFunctions([Renamed])).toThrow('RENAMED_TOOLS');
  });

  it('refuses an empty permission key', () => {
    class Empty {
      @AgentFunction({ name: 'empty_key', description: 'x', permissions: [' '] })
      run() {}
    }
    expect(() => validateAgentFunctions([Empty])).toThrow('permission keys');
  });

  it('refuses an MCP function that is not read-only', () => {
    class Writes {
      @AgentFunction({ name: 'writes', description: 'x', permissions: [], mcp: true })
      run() {}
    }
    expect(() => validateAgentFunctions([Writes])).toThrow('readOnly');
  });

  it('refuses an MCP function whose schema is built per run', () => {
    class PerRun {
      @AgentFunction({
        name: 'per_run',
        description: 'x',
        inputSchema: () => z.object({}),
        permissions: [],
        readOnly: true,
        mcp: true,
      })
      run() {}
    }
    expect(() => validateAgentFunctions([PerRun])).toThrow('static z.object()');
  });
});
