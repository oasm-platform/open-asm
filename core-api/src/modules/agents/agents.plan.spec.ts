import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import type { ApprovalSettings } from './agents.approvals';
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { AgentsCompletionsService, planningState } from './agents.completions';
import { formatTodosToPrompt, type AgentTodoItem } from './agents.todo';
import { AgentTool } from './agents.tools';
import type { TodoStatus } from './entities/agent-conversation-todo.entity';

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

interface TodoRow {
  id: string;
  conversationId: string;
  content: string;
  status: TodoStatus;
  sortOrder: number;
  updatedAt: Date;
}

/** In-memory stand-in for Repository<AgentConversationTodo>. */
function createTodoRepo() {
  let rows: TodoRow[] = [];
  let nextId = 1;
  const matches = (row: TodoRow, where: Partial<TodoRow>) =>
    Object.entries(where).every(([k, v]) => row[k as keyof TodoRow] === v);
  const sorted = (list: TodoRow[]) =>
    [...list].sort((a, b) => a.sortOrder - b.sortOrder);

  const repo = {
    get rows() {
      return sorted(rows);
    },
    set rows(value: TodoRow[]) {
      rows = value;
    },
    find: jest.fn(({ where }: { where: Partial<TodoRow> }) =>
      Promise.resolve(sorted(rows.filter((r) => matches(r, where)))),
    ),
    findOne: jest.fn(({ where }: { where: Partial<TodoRow> }) =>
      Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
    ),
    create: jest.fn((v: Partial<TodoRow>) => ({ ...v }) as TodoRow),
    save: jest.fn((v: TodoRow | TodoRow[]) => {
      for (const row of Array.isArray(v) ? v : [v]) {
        row.id ??= `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
        row.updatedAt = new Date();
        if (!rows.includes(row)) rows.push(row);
      }
      return Promise.resolve(v);
    }),
    delete: jest.fn((where: Partial<TodoRow>) => {
      rows = rows.filter((r) => !matches(r, where));
      return Promise.resolve();
    }),
    createQueryBuilder: jest.fn(() => {
      const qb = {
        select: () => qb,
        where: () => qb,
        getRawOne: () =>
          Promise.resolve({
            max: rows.length ? Math.max(...rows.map((r) => r.sortOrder)) : null,
          }),
      };
      return qb;
    }),
  };
  const manager = {
    transaction: jest.fn(
      (cb: (m: { getRepository: () => unknown }) => Promise<unknown>) =>
        cb({ getRepository: () => repo }),
    ),
  };
  return Object.assign(repo, { manager });
}

interface ToolResult {
  success: boolean;
  message: string;
  error?: string;
}
type ToolLike = {
  execute: (input: unknown, options?: unknown) => Promise<ToolResult>;
};

describe('formatTodosToPrompt', () => {
  const todo = (
    content: string,
    status: AgentTodoItem['status'],
  ): AgentTodoItem => ({
    id: content,
    content,
    status,
    sortOrder: 0,
    updatedAt: '',
  });

  it('says when there is no plan', () => {
    expect(formatTodosToPrompt([])).toBe('No specific plan has been set up yet.');
  });

  it('marks the first unfinished step as current', () => {
    const prompt = formatTodosToPrompt([
      todo('recon', 'completed'),
      todo('scan', 'pending'),
      todo('report', 'pending'),
    ]);
    expect(prompt).toContain('Step 2: scan (PENDING) <<<< YOU ARE HERE');
    expect(prompt).not.toContain('Step 3: report (PENDING) <<<<');
    expect(prompt).toContain('>>> CURRENT STEP: Step 2');
    expect(prompt).toContain('call scrap_plan first');
  });

  it('reports a finished plan', () => {
    expect(formatTodosToPrompt([todo('recon', 'completed')])).toContain(
      '>>> ALL STEPS COMPLETED <<<',
    );
  });
});

describe('AgentTool plan tools', () => {
  let repo: ReturnType<typeof createTodoRepo>;
  let conversations: { update: jest.Mock };
  let approvals: {
    requestPlanApproval: jest.Mock;
    resetConversation: jest.Mock;
    authorize: jest.Mock;
  };
  let emitter: EventEmitter;
  let agentTool: AgentTool;

  const settings = (mode: AgentApprovalMode): ApprovalSettings => ({
    userId: 'u1',
    mode,
  });

  const todoTools = (approval?: ApprovalSettings) =>
    agentTool.getTodoTools(
      'c1',
      emitter,
      approval ? { workspaceId: 'w1', approval } : undefined,
    ) as unknown as Record<string, ToolLike>;

  beforeEach(() => {
    repo = createTodoRepo();
    conversations = { update: jest.fn(() => Promise.resolve()) };
    approvals = {
      requestPlanApproval: jest.fn(),
      resetConversation: jest.fn(() => Promise.resolve()),
      authorize: jest.fn(() => Promise.resolve({ allowed: true })),
    };
    emitter = new EventEmitter();
    agentTool = new (AgentTool as unknown as new (...args: unknown[]) => AgentTool)(
      ...(Array(9).fill(null) as unknown[]),
      conversations,
      repo,
      null,
      approvals,
    );
  });

  describe('outside plan mode', () => {
    it.each([AgentApprovalMode.AUTO, AgentApprovalMode.MANUAL])(
      'refuses to make or extend a plan in %s mode',
      async (mode) => {
        const tools = todoTools(settings(mode));
        const made = await tools.formulate_plan.execute({ steps: ['a'] });
        const appended = await tools.append_step.execute({ content: 'b' });
        expect(made).toMatchObject({ success: false });
        expect(made.message).toContain('planning is off');
        expect(appended).toMatchObject({ success: false });
        expect(repo.rows).toHaveLength(0);
      },
    );
  });

  describe('plan mechanics', () => {
    let tools: Record<string, ToolLike>;
    beforeEach(() => {
      tools = todoTools();
    });

    const formulate = (steps: unknown) =>
      tools.formulate_plan.execute({ steps });
    const transition = (id: string, status: TodoStatus) =>
      tools.transition_step.execute({ id, status });

    it('creates the steps in order and shows them without asking', async () => {
      const emitted = jest.fn();
      emitter.on('todos-updated', emitted);

      const result = await formulate(['Enumerate subdomains', 'Scan ports']);

      expect(result.success).toBe(true);
      expect(repo.rows.map((r) => [r.content, r.status])).toEqual([
        ['Enumerate subdomains', 'pending'],
        ['Scan ports', 'pending'],
      ]);
      expect(repo.manager.transaction).toHaveBeenCalled();
      expect(approvals.requestPlanApproval).not.toHaveBeenCalled();
      expect(emitted).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ content: 'Scan ports' }),
        ]),
      );
    });

    it('unpacks steps the model sent as one JSON string', async () => {
      await formulate(['["a", "b", "c"]']);
      expect(repo.rows.map((r) => r.content)).toEqual(['a', 'b', 'c']);
    });

    it('rejects a new plan while steps are still pending', async () => {
      await formulate(['a', 'b']);
      const result = await formulate(['x']);
      expect(result.success).toBe(false);
      expect(result.message).toContain('REJECTED');
      expect(repo.rows.map((r) => r.content)).toEqual(['a', 'b']);
    });

    it('rejects plans that are too long', async () => {
      const result = await formulate(
        Array.from({ length: 21 }, (_, i) => `step ${i}`),
      );
      expect(result.success).toBe(false);
      expect(repo.rows).toHaveLength(0);
    });

    it('enforces strict step order', async () => {
      await formulate(['a', 'b']);
      const [a, b] = repo.rows;

      expect((await transition(b.id, 'in_progress')).success).toBe(false);
      expect((await transition(a.id, 'completed')).success).toBe(false);

      expect((await transition(a.id, 'in_progress')).success).toBe(true);
      expect((await transition(a.id, 'completed')).success).toBe(true);
      expect((await transition(b.id, 'in_progress')).success).toBe(true);
    });

    it('allows a new plan once every step is finished', async () => {
      await formulate(['a']);
      const [a] = repo.rows;
      await transition(a.id, 'in_progress');
      await transition(a.id, 'failed');

      expect((await formulate(['b'])).success).toBe(true);
      expect(repo.rows.map((r) => r.content)).toEqual(['b']);
    });

    it('appends a step after the last one', async () => {
      await formulate(['a']);
      await tools.append_step.execute({ content: 'b' });
      expect(repo.rows.map((r) => [r.content, r.sortOrder])).toEqual([
        ['a', 0],
        ['b', 1],
      ]);
    });

    it('scrapping the plan clears it', async () => {
      await formulate(['a']);
      expect((await tools.scrap_plan.execute({})).success).toBe(true);
      expect(repo.rows).toHaveLength(0);
    });
  });

  describe('in plan approval mode', () => {
    const formulate = (approval: ApprovalSettings, steps: string[]) =>
      todoTools(approval).formulate_plan.execute(
        { steps },
        { toolCallId: 'tc1' },
      );

    it('shows the plan before asking, then asks with its steps', async () => {
      const shown = jest.fn();
      emitter.on('todos-updated', shown);
      approvals.requestPlanApproval.mockImplementation(() => {
        // the plan is already on screen while the user decides
        expect(shown).toHaveBeenCalled();
        return Promise.resolve({ allowed: true, mode: AgentApprovalMode.AUTO });
      });

      await formulate(settings(AgentApprovalMode.PLAN), ['a', 'b']);

      expect(approvals.requestPlanApproval).toHaveBeenCalledWith(
        ['a', 'b'],
        'tc1',
        {
          userId: 'u1',
          mode: AgentApprovalMode.PLAN,
          workspaceId: 'w1',
          conversationId: 'c1',
        },
        emitter,
        undefined,
      );
    });

    it.each([AgentApprovalMode.AUTO, AgentApprovalMode.MANUAL])(
      'switches the run, the conversation and the client to %s',
      async (mode) => {
        const approval = settings(AgentApprovalMode.PLAN);
        const changed = jest.fn();
        emitter.on('approval-mode-changed', changed);
        approvals.requestPlanApproval.mockResolvedValue({ allowed: true, mode });

        const result = await formulate(approval, ['a', 'b']);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Start with step 1');
        expect(approval.mode).toBe(mode);
        expect(conversations.update).toHaveBeenCalledWith('c1', {
          approvalMode: mode,
        });
        expect(approvals.resetConversation).toHaveBeenCalledWith('c1');
        expect(changed).toHaveBeenCalledWith({ mode });
        expect(repo.rows).toHaveLength(2);
      },
    );

    it('discards a rejected plan and tells the agent why', async () => {
      const approval = settings(AgentApprovalMode.PLAN);
      const emitted = jest.fn();
      emitter.on('todos-updated', emitted);
      approvals.requestPlanApproval.mockResolvedValue({
        allowed: false,
        feedback: 'skip the port scan',
      });

      const result = await formulate(approval, ['a', 'b']);

      expect(result.success).toBe(false);
      expect(result.error).toContain('was not approved by the user');
      expect(result.error).toContain('skip the port scan');
      expect(repo.rows).toHaveLength(0);
      expect(emitted).toHaveBeenLastCalledWith([]);
      expect(approval.mode).toBe(AgentApprovalMode.PLAN);
      expect(conversations.update).not.toHaveBeenCalled();
    });

    it('tells the agent to plan first when a tool runs before the plan', async () => {
      approvals.authorize.mockResolvedValue({
        allowed: false,
        planRequired: true,
      });
      const tools = agentTool.getTools(
        'w1',
        AgentMode.AGENT,
        emitter,
        'c1',
        false,
        { ...settings(AgentApprovalMode.PLAN), planFirst: true },
      ) as unknown as Record<string, { execute: ToolLike['execute'] }>;

      const result = (await tools.enumerate_assets.execute(
        {},
        { toolCallId: 'tc1' },
      )) as unknown as { error: string };

      expect(result.error).toContain('needs an approved plan first');
      expect(result.error).toContain('formulate_plan');
      expect(result.error).not.toContain('was not approved by the user');
    });

    it('lets later tool calls use the mode picked for the plan', async () => {
      const approval = settings(AgentApprovalMode.PLAN);
      approvals.requestPlanApproval.mockResolvedValue({
        allowed: true,
        mode: AgentApprovalMode.AUTO,
      });
      const tools = agentTool.getTools(
        'w1',
        AgentMode.AGENT,
        emitter,
        'c1',
        false,
        approval,
      ) as unknown as Record<string, ToolLike>;
      await formulate(approval, ['a']);

      // the gated call is rejected so the underlying service is never hit
      approvals.authorize.mockResolvedValue({ allowed: false });
      await tools.enumerate_assets.execute({}, { toolCallId: 'tc2' });

      expect(approvals.authorize).toHaveBeenCalledWith(
        expect.any(String),
        'tc2',
        expect.objectContaining({ mode: AgentApprovalMode.AUTO }),
        emitter,
        expect.anything(),
        undefined,
      );
    });

    it('refuses another plan once one was approved', async () => {
      const approval = settings(AgentApprovalMode.PLAN);
      approvals.requestPlanApproval.mockResolvedValue({
        allowed: true,
        mode: AgentApprovalMode.MANUAL,
      });
      const tools = todoTools(approval);
      await tools.formulate_plan.execute({ steps: ['a'] }, { toolCallId: 'tc1' });
      const [a] = repo.rows;
      await tools.transition_step.execute({ id: a.id, status: 'in_progress' });
      await tools.transition_step.execute({ id: a.id, status: 'completed' });

      const again = await tools.formulate_plan.execute(
        { steps: ['b'] },
        { toolCallId: 'tc2' },
      );
      expect(again).toMatchObject({ success: false });
      expect(approvals.requestPlanApproval).toHaveBeenCalledTimes(1);
      expect(repo.rows.map((r) => r.content)).toEqual(['a']);
    });
  });
});

describe('AgentsCompletionsService plan execution', () => {
  let repo: ReturnType<typeof createTodoRepo>;
  let service: any;
  let iteration: jest.Mock;

  const row = (content: string, status: TodoStatus, sortOrder: number) =>
    ({
      id: content,
      conversationId: 'c1',
      content,
      status,
      sortOrder,
      updatedAt: new Date(),
    });

  const setStatus = (id: string, status: TodoStatus) => {
    repo.rows.find((r) => r.id === id)!.status = status;
  };

  beforeEach(() => {
    repo = createTodoRepo();
    service = Object.create(AgentsCompletionsService.prototype);
    service.logger = new Logger('test');
    jest.spyOn(service.logger, 'log').mockImplementation(() => {});
    jest.spyOn(service.logger, 'warn').mockImplementation(() => {});
    jest.spyOn(service.logger, 'error').mockImplementation(() => {});
    service.todoRepository = repo;
    service.conversationRepository = {
      findOne: jest.fn(() => Promise.resolve({ id: 'c1', summary: null })),
    };
    service.checkAndCompactMidLoop = jest.fn(() => Promise.resolve(false));
    service.getConversationHistory = jest.fn(() => Promise.resolve([]));
    service.pruneContextByBudget = jest.fn(() => []);
    service.mapHistoryToModelMessages = jest.fn(() => []);
    service.getModelContextWindow = jest.fn(() => 128_000);
    service.saveAssistantMessage = jest.fn(() =>
      Promise.resolve({ id: 'm2', metadata: {} }),
    );
    service.buildSystemContext = jest.fn(() => Promise.resolve(['ctx']));
    service.generateEndOfConversationReport = jest.fn(() => Promise.resolve());
    iteration = jest.fn();
    service.executeStreamText = jest.fn(() => {
      iteration();
      return {
        aiStream: new ReadableStream({ start: (c) => c.close() }),
        finishPromise: Promise.resolve(),
      };
    });
  });

  const run = async (
    agentMode = AgentMode.AGENT,
    approvalMode = AgentApprovalMode.MANUAL,
  ) => {
    const stream: ReadableStream = service.createContinuationStream({
      llmConfig: {},
      model: {},
      modelMessages: [],
      contextParts: ['ctx'],
      assistantMessageId: 'm1',
      conversationId: 'c1',
      assistantMessageMetadata: {},
      tools: undefined,
      todosEmitter: new EventEmitter(),
      agentMode,
      approvalMode,
      workspaceId: 'w1',
      userId: 'u1',
    });
    const reader = stream.getReader();
    while (!(await reader.read()).done) {
      /* drain */
    }
    // let the fire-and-forget cleanup settle
    await new Promise((r) => setImmediate(r));
  };

  it('keeps going while the plan advances and stops when it is done', async () => {
    repo.rows = [row('a', 'pending', 0), row('b', 'pending', 1)];
    const order = ['a', 'b'];
    iteration.mockImplementation(() => setStatus(order.shift()!, 'completed'));

    await run();

    expect(service.executeStreamText).toHaveBeenCalledTimes(2);
    expect(repo.rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('keeps running an approved plan in Ask mode when plan mode is on', async () => {
    repo.rows = [row('a', 'pending', 0), row('b', 'pending', 1)];
    const order = ['a', 'b'];
    iteration.mockImplementation(() => setStatus(order.shift()!, 'completed'));

    await run(AgentMode.ASK, AgentApprovalMode.PLAN);

    expect(service.executeStreamText).toHaveBeenCalledTimes(2);
    expect(repo.rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('answers once in Ask mode without plan mode', async () => {
    repo.rows = [row('a', 'pending', 0)];

    await run(AgentMode.ASK, AgentApprovalMode.MANUAL);

    expect(service.executeStreamText).toHaveBeenCalledTimes(1);
  });

  it('stops re-prompting once the plan stops moving', async () => {
    repo.rows = [row('a', 'pending', 0), row('b', 'pending', 1)];

    await run();

    expect(service.executeStreamText).toHaveBeenCalledTimes(2);
    expect(repo.rows.map((r) => r.status)).toEqual(['pending', 'pending']);
  });

  it('stops after repeated iteration errors', async () => {
    repo.rows = [row('a', 'pending', 0)];
    service.executeStreamText.mockImplementation(() => {
      throw new Error('provider down');
    });

    await run();

    expect(service.executeStreamText).toHaveBeenCalledTimes(3);
  });

  it('does not mark unfinished steps as done when the run stops early', async () => {
    repo.rows = [row('a', 'pending', 0), row('b', 'pending', 1)];
    iteration.mockImplementation(() => setStatus('a', 'in_progress'));

    await run();

    expect(repo.rows.map((r) => r.status)).toEqual(['in_progress', 'pending']);
  });

  it('closes out a forgotten last step', async () => {
    repo.rows = [row('a', 'completed', 0), row('b', 'in_progress', 1)];

    await service.autoCompleteStuckTodos('c1');

    expect(repo.rows.map((r) => r.status)).toEqual(['completed', 'completed']);
  });

  it('closes out a forgotten last step in Ask mode with plan approval', async () => {
    repo.rows = [row('a', 'in_progress', 0)];

    await run(AgentMode.ASK, AgentApprovalMode.PLAN);

    expect(repo.rows[0].status).toBe('completed');
  });
});

describe('AgentsCompletionsService plan mode prompt', () => {
  const build = (
    agentMode: AgentMode,
    approvalMode: AgentApprovalMode,
    todos: TodoStatus[] = [],
  ) => {
    const service: any = Object.create(AgentsCompletionsService.prototype);
    service.getPrompt = jest.fn((name: string) => `prompt:${name}`);
    service.agentsMemories = {
      stmFormatForPrompt: jest.fn(() => Promise.resolve('')),
      ltmFormatForPrompt: jest.fn(() => Promise.resolve('')),
    };
    service.todoRepository = createTodoRepo();
    service.todoRepository.rows = todos.map((status, i) => ({
      id: `t${i}`,
      conversationId: 'c1',
      content: `step ${i}`,
      status,
      sortOrder: i,
      updatedAt: new Date(),
    }));
    return service.buildSystemContext(
      { id: 'c1', summary: null, approvalMode },
      'w1',
      agentMode,
      'u1',
    ) as Promise<string[]>;
  };

  it.each([AgentMode.AGENT, AgentMode.ASK])(
    'asks for a plan first in %s mode when plan mode is on',
    async (agentMode) => {
      const parts = await build(agentMode, AgentApprovalMode.PLAN);
      const last = parts[parts.length - 1];
      expect(last).toContain('PLAN MODE IS ON');
      expect(last).toContain('formulate_plan');
    },
  );

  it.each([AgentApprovalMode.AUTO, AgentApprovalMode.MANUAL])(
    'says nothing about plans in %s mode, not even a finished one',
    async (mode) => {
      const parts = await build(AgentMode.AGENT, mode, ['completed']);
      const text = parts.join('\n');
      expect(text).not.toContain('PLAN MODE IS ON');
      expect(text).not.toContain('prompt:PLAN.md');
      expect(text).not.toContain('step 0');
    },
  );

  it('loads the plan prompt in plan mode', async () => {
    const parts = await build(AgentMode.AGENT, AgentApprovalMode.PLAN);
    expect(parts.join('\n')).toContain('prompt:PLAN.md');
  });

  it('only lets an approved plan finish once the mode switched', async () => {
    const parts = await build(AgentMode.AGENT, AgentApprovalMode.MANUAL, [
      'completed',
      'pending',
    ]);
    const text = parts.join('\n');
    expect(text).toContain('AN APPROVED PLAN IS UNFINISHED');
    expect(text).not.toContain('PLAN MODE IS ON');
    expect(text).toContain('step 1');
  });
});

describe('planning state', () => {
  const todo = (status: TodoStatus) => ({ status });

  it('plans only in plan mode', () => {
    expect(planningState(AgentApprovalMode.PLAN, [])).toBe('create');
    expect(planningState(AgentApprovalMode.MANUAL, [])).toBe('off');
    expect(planningState(AgentApprovalMode.AUTO, [todo('completed')])).toBe(
      'off',
    );
  });

  it('finishes a plan approved earlier', () => {
    expect(
      planningState(AgentApprovalMode.MANUAL, [
        todo('completed'),
        todo('pending'),
      ]),
    ).toBe('finish');
  });

  it('gives no plan tools when off, and only finishing ones after approval', () => {
    const service: any = Object.create(AgentsCompletionsService.prototype);
    service.agentTool = {
      getTodoTools: jest.fn(() => ({
        formulate_plan: {},
        transition_step: {},
        append_step: {},
        scrap_plan: {},
      })),
    };
    const tools = (planning: string) =>
      Object.keys(
        service.getPlanTools(planning, 'c1', new EventEmitter(), {}) as object,
      );
    expect(tools('off')).toEqual([]);
    expect(tools('finish')).toEqual(['transition_step', 'scrap_plan']);
    expect(tools('create')).toHaveLength(4);
  });
});
