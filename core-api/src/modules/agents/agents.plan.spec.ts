import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import type { ApprovalSettings } from './agents.approvals';
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import {
  AgentsCompletionsService,
  planningState,
  type PlanningState,
  withStepResults,
} from './agents.completions';
import { SUBAGENT_MAX_ROUNDS_PER_TURN } from './agents.subagents';
import { formatTodosToPrompt, type AgentTodoItem } from './agents.todo';
import { AgentTool } from './agents.tools';
import type { TodoStatus } from './entities/agent-conversation-todo.entity';
import { stepLimit } from './shared/step-limit';
import { emptyStats } from './shared/turn-stats';

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
    expect(formatTodosToPrompt([])).toBe(
      'No specific plan has been set up yet.',
    );
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

  it('pins the goal above the plan while steps remain', () => {
    const prompt = formatTodosToPrompt(
      [todo('recon', 'in_progress')],
      'Map the exposed ports of example.com',
    );
    expect(prompt).toContain(
      '# PINNED GOAL (stays pinned until every step is completed or failed):\nMap the exposed ports of example.com',
    );
    expect(prompt.indexOf('PINNED GOAL')).toBeLessThan(
      prompt.indexOf('CURRENT EXECUTION PLAN'),
    );
  });

  it('asks whether the goal was met once the plan is finished', () => {
    const prompt = formatTodosToPrompt([todo('recon', 'completed')], 'g');
    expect(prompt).not.toContain('PINNED GOAL');
    expect(prompt).toContain('# GOAL OF THE FINISHED PLAN:\ng');
  });
});

describe('AgentTool plan tools', () => {
  let repo: ReturnType<typeof createTodoRepo>;
  let conversations: {
    update: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  /** The conversation's metadata, as written by updateConversationMetadata */
  let metadata: Record<string, unknown> | null;
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
    metadata = null;
    const metadataManager = {
      findOne: jest.fn(() => Promise.resolve({ id: 'c1', metadata })),
      update: jest.fn(
        (
          _entity: unknown,
          _where: unknown,
          set: { metadata: typeof metadata },
        ) => {
          metadata = set.metadata;
          return Promise.resolve();
        },
      ),
    };
    conversations = {
      update: jest.fn(() => Promise.resolve()),
      manager: {
        transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) =>
          cb(metadataManager),
        ),
      },
    };
    approvals = {
      requestPlanApproval: jest.fn(),
      resetConversation: jest.fn(() => Promise.resolve()),
      authorize: jest.fn(() => Promise.resolve({ allowed: true })),
    };
    emitter = new EventEmitter();
    agentTool = new (
      AgentTool as unknown as new (...args: unknown[]) => AgentTool
    )(
      ...(Array(9).fill(null) as unknown[]),
      conversations,
      repo,
      null,
      approvals,
      { getAgentConnectors: () => [], getConnector: () => null },
    );
  });

  describe('outside Agent mode', () => {
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

  describe('agent mode (self-managed todo)', () => {
    const agentTools = (mode: AgentApprovalMode) =>
      agentTool.getTodoTools('c1', emitter, {
        workspaceId: 'w1',
        approval: settings(mode),
        selfManaged: true,
      }) as unknown as Record<string, ToolLike>;

    beforeEach(() => {
      approvals.requestPlanApproval.mockResolvedValue({
        allowed: true,
        mode: AgentApprovalMode.AUTO,
      });
    });

    it.each([AgentApprovalMode.AUTO, AgentApprovalMode.MANUAL])(
      'has the user approve the plan, pins its goal and lets it grow in %s mode',
      async (mode) => {
        const tools = agentTools(mode);
        const made = await tools.formulate_plan.execute({
          goal: '  List open ports of example.com  ',
          steps: ['scan', 'report'],
        });
        expect(made).toMatchObject({
          success: true,
          goal: 'List open ports of example.com',
        });
        expect(approvals.requestPlanApproval).toHaveBeenCalledTimes(1);
        expect(metadata).toMatchObject({
          goal: 'List open ports of example.com',
        });
        expect(repo.rows.map((r) => r.content)).toEqual(['scan', 'report']);

        // No second review for a step added while the plan runs
        expect(
          (await tools.append_step.execute({ content: 'verify' })).success,
        ).toBe(true);
        expect(repo.rows).toHaveLength(3);
        expect(approvals.requestPlanApproval).toHaveBeenCalledTimes(1);
      },
    );

    it('makes work after a finished plan a new plan to review', async () => {
      const tools = agentTools(AgentApprovalMode.AUTO);
      await tools.formulate_plan.execute({ steps: ['scan'] });
      const [scan] = repo.rows;
      await tools.transition_step.execute({ id: scan.id, status: 'in_progress' });
      await tools.transition_step.execute({ id: scan.id, status: 'completed' });

      const appended = await tools.append_step.execute({ content: 'more' });
      expect(appended).toMatchObject({ success: false });
      expect(appended.message).toContain('formulate_plan');
      expect(repo.rows.map((r) => r.content)).toEqual(['scan']);

      expect(
        (await tools.formulate_plan.execute({ steps: ['more'] })).success,
      ).toBe(true);
      expect(approvals.requestPlanApproval).toHaveBeenCalledTimes(2);
      expect(repo.rows.map((r) => r.content)).toEqual(['more']);
    });

    it('sends the goal to the client only when it changes', async () => {
      const emitted = jest.fn();
      emitter.on('todos-updated', emitted);
      const tools = agentTools(AgentApprovalMode.AUTO);

      await tools.formulate_plan.execute({ goal: 'g', steps: ['a'] });
      expect(emitted).toHaveBeenLastCalledWith(expect.any(Array), 'g');

      await tools.transition_step.execute({
        id: repo.rows[0].id,
        status: 'in_progress',
      });
      expect(emitted).toHaveBeenLastCalledWith(expect.any(Array), undefined);

      await tools.scrap_plan.execute({});
      expect(emitted).toHaveBeenLastCalledWith([], null);
    });

    it('unpins the goal when the plan is scrapped', async () => {
      const tools = agentTools(AgentApprovalMode.AUTO);
      await tools.formulate_plan.execute({ goal: 'g', steps: ['a'] });
      await tools.scrap_plan.execute({});
      expect(repo.rows).toHaveLength(0);
      expect(metadata).toMatchObject({ goal: null });
    });
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
      // No goal passed: the UI is told the plan changed but the goal did not
      expect(emitted).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ content: 'Scan ports' }),
        ]),
        undefined,
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

  describe('plan approval in Agent mode', () => {
    const agentTodoTools = (approval: ApprovalSettings) =>
      agentTool.getTodoTools('c1', emitter, {
        workspaceId: 'w1',
        approval,
        selfManaged: true,
      }) as unknown as Record<string, ToolLike>;
    const formulate = (approval: ApprovalSettings, steps: string[]) =>
      agentTodoTools(approval).formulate_plan.execute(
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

      await formulate(settings(AgentApprovalMode.MANUAL), ['a', 'b']);

      expect(approvals.requestPlanApproval).toHaveBeenCalledWith(
        ['a', 'b'],
        'tc1',
        {
          userId: 'u1',
          mode: AgentApprovalMode.MANUAL,
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
        const approval = settings(
          mode === AgentApprovalMode.AUTO
            ? AgentApprovalMode.MANUAL
            : AgentApprovalMode.AUTO,
        );
        const changed = jest.fn();
        emitter.on('approval-mode-changed', changed);
        approvals.requestPlanApproval.mockResolvedValue({
          allowed: true,
          mode,
        });

        const result = await formulate(approval, ['a', 'b']);

        expect(result.success).toBe(true);
        expect(result.message).toContain('transition_step');
        expect(result.message).toContain('step 1');
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
      const approval = settings(AgentApprovalMode.MANUAL);
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
      expect(emitted).toHaveBeenLastCalledWith([], null);
      expect(approval.mode).toBe(AgentApprovalMode.MANUAL);
      expect(conversations.update).not.toHaveBeenCalled();
    });

    it('tells the agent to plan first when a tool runs before the plan', async () => {
      approvals.authorize.mockResolvedValue({
        allowed: false,
        todoRequired: true,
      });
      const tools = agentTool.getTools(
        'w1',
        AgentMode.AGENT,
        emitter,
        'c1',
        settings(AgentApprovalMode.AUTO),
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
      const approval = settings(AgentApprovalMode.MANUAL);
      approvals.requestPlanApproval.mockResolvedValue({
        allowed: true,
        mode: AgentApprovalMode.AUTO,
      });
      const tools = agentTool.getTools(
        'w1',
        AgentMode.AGENT,
        emitter,
        'c1',
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

    it('asks again for the next plan once the approved one is done', async () => {
      const approval = settings(AgentApprovalMode.MANUAL);
      approvals.requestPlanApproval.mockResolvedValue({
        allowed: true,
        mode: AgentApprovalMode.AUTO,
      });
      const tools = agentTodoTools(approval);
      await tools.formulate_plan.execute(
        { steps: ['a'] },
        { toolCallId: 'tc1' },
      );
      const [a] = repo.rows;
      await tools.transition_step.execute({ id: a.id, status: 'in_progress' });
      await tools.transition_step.execute({ id: a.id, status: 'completed' });

      const again = await tools.formulate_plan.execute(
        { steps: ['b'] },
        { toolCallId: 'tc2' },
      );
      expect(again).toMatchObject({ success: true });
      expect(approvals.requestPlanApproval).toHaveBeenCalledTimes(2);
      expect(approvals.requestPlanApproval).toHaveBeenLastCalledWith(
        ['b'],
        'tc2',
        expect.objectContaining({ mode: AgentApprovalMode.AUTO }),
        emitter,
        undefined,
      );
      expect(repo.rows.map((r) => r.content)).toEqual(['b']);
    });
  });
});

describe('AgentsCompletionsService plan execution', () => {
  let repo: ReturnType<typeof createTodoRepo>;
  let service: any;
  let iteration: jest.Mock;

  const row = (content: string, status: TodoStatus, sortOrder: number) => ({
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
    service.persistTurnMetadata = jest.fn(() => Promise.resolve(null));
    service.subagents = {
      subscribe: jest.fn(() => () => {}),
      subscribeScreenshots: jest.fn(() => () => {}),
      hasActive: jest.fn(() => Promise.resolve(false)),
      countUndelivered: jest.fn(() => Promise.resolve(0)),
      takeUndelivered: jest.fn(() => Promise.resolve([])),
      releaseDelivery: jest.fn(() => Promise.resolve()),
      waitForSettled: jest.fn(() => Promise.resolve('settled')),
      formatResultsMessage: jest.fn(() => 'RESULTS'),
    };
    iteration = jest.fn();
    service.executeStreamText = jest.fn(() => {
      iteration();
      return {
        aiStream: new ReadableStream({ start: (c) => c.close() }),
        finishPromise: Promise.resolve(),

        settle: jest.fn(() => Promise.resolve('answer')),
        getFinishReason: () => undefined,
      };
    });
  });

  const run = async (
    agentMode = AgentMode.AGENT,
    approvalMode = AgentApprovalMode.MANUAL,
    planning?: PlanningState,
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
      planning,
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

  it('keeps running a plan left from Agent mode in Ask mode', async () => {
    repo.rows = [row('a', 'pending', 0), row('b', 'pending', 1)];
    const order = ['a', 'b'];
    iteration.mockImplementation(() => setStatus(order.shift()!, 'completed'));

    await run(AgentMode.ASK, AgentApprovalMode.MANUAL, 'finish');

    expect(service.executeStreamText).toHaveBeenCalledTimes(2);
    expect(repo.rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('answers once in Ask mode without a plan to finish', async () => {
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

  it('continues past the step cap until the model finishes', async () => {
    repo.rows = [];
    const reasons = ['tool-calls', 'tool-calls', 'stop'];
    service.executeStreamText.mockImplementation(() => ({
      aiStream: new ReadableStream({ start: (c) => c.close() }),
      finishPromise: Promise.resolve(),
      settle: jest.fn(() => Promise.resolve('answer')),
      getFinishReason: () => reasons.shift(),
    }));

    await run();

    expect(service.executeStreamText).toHaveBeenCalledTimes(3);
  });

  it('stops at one iteration when the model finishes on its own', async () => {
    repo.rows = [];
    service.executeStreamText.mockImplementation(() => ({
      aiStream: new ReadableStream({ start: (c) => c.close() }),
      finishPromise: Promise.resolve(),
      settle: jest.fn(() => Promise.resolve('answer')),
      getFinishReason: () => 'stop',
    }));

    await run();

    expect(service.executeStreamText).toHaveBeenCalledTimes(1);
  });

  it('stops after repeated iteration errors', async () => {
    repo.rows = [row('a', 'pending', 0)];
    service.executeStreamText.mockImplementation(() => {
      throw new Error('provider down');
    });

    await run();

    expect(service.executeStreamText).toHaveBeenCalledTimes(3);
  });

  it('settles and retries an iteration the provider ended without an answer', async () => {
    const settle = jest.fn(() => Promise.resolve('none'));
    service.executeStreamText.mockImplementation(() => ({
      aiStream: new ReadableStream({ start: (c) => c.close() }),
      finishPromise: Promise.resolve(),
      settle,
      getFinishReason: () => undefined,
    }));

    await run(AgentMode.ASK, AgentApprovalMode.MANUAL);

    expect(service.executeStreamText).toHaveBeenCalledTimes(3);
    expect(settle).toHaveBeenCalledWith('error');
  });

  it('keeps a partial answer instead of re-running the tools it already ran', async () => {
    repo.rows = [row('a', 'pending', 0)];
    const settle = jest.fn(() => Promise.resolve('partial'));
    service.executeStreamText.mockImplementation(() => ({
      aiStream: new ReadableStream({
        // Fails after some steps streamed
        pull: (c) => c.error(new Error('connection reset')),
      }),
      finishPromise: Promise.resolve(),
      settle,
      getFinishReason: () => undefined,
    }));

    await run();

    expect(service.executeStreamText).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith('error');
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

  it('closes out a forgotten last step of a plan finished in Ask mode', async () => {
    repo.rows = [row('a', 'in_progress', 0)];

    await run(AgentMode.ASK, AgentApprovalMode.MANUAL, 'finish');

    expect(repo.rows[0].status).toBe('completed');
  });

  describe('background subagents', () => {
    const finished = [{ id: 's1', status: 'completed', sortOrder: 0 }];

    it('waits for active subagents, then continues with their results', async () => {
      service.subagents.hasActive.mockResolvedValueOnce(true);
      service.subagents.takeUndelivered.mockResolvedValueOnce(finished);

      await run(AgentMode.ASK, AgentApprovalMode.MANUAL);

      expect(service.subagents.waitForSettled).toHaveBeenCalledTimes(1);
      expect(service.executeStreamText).toHaveBeenCalledTimes(2);
      const second = service.executeStreamText.mock.calls[1][0];
      expect(second.modelMessages.at(-1)).toEqual({
        role: 'user',
        content: 'RESULTS',
      });
    });

    it('stops resuming after the per-turn round cap', async () => {
      service.subagents.hasActive.mockResolvedValue(true);
      service.subagents.takeUndelivered.mockResolvedValue(finished);

      await run(AgentMode.ASK, AgentApprovalMode.MANUAL);

      // Every round plus the first run of the turn
      expect(service.executeStreamText).toHaveBeenCalledTimes(
        SUBAGENT_MAX_ROUNDS_PER_TURN + 1,
      );
    });

    it('hands back finished results between plan steps without waiting', async () => {
      repo.rows = [row('a', 'pending', 0), row('b', 'pending', 1)];
      const order = ['a', 'b'];
      iteration.mockImplementation(() =>
        setStatus(order.shift()!, 'completed'),
      );
      service.subagents.takeUndelivered.mockResolvedValueOnce(finished);

      await run();

      expect(service.subagents.waitForSettled).not.toHaveBeenCalled();
      const second = service.executeStreamText.mock.calls[1][0];
      expect(second.modelMessages.at(-1).content).toContain('RESULTS');
    });

    it('releases injected results when the iteration fails', async () => {
      service.executeStreamText.mockImplementation(() => {
        throw new Error('provider down');
      });

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
        agentMode: AgentMode.ASK,
        approvalMode: AgentApprovalMode.MANUAL,
        workspaceId: 'w1',
        userId: 'u1',
        deliveredSubagentIds: ['s1'],
      });
      const reader = stream.getReader();
      while (!(await reader.read()).done) {
        /* drain */
      }

      expect(service.subagents.releaseDelivery).toHaveBeenCalledWith(['s1']);
    });

    it('keeps injected results pending across a retry that succeeds', async () => {
      let calls = 0;
      service.executeStreamText.mockImplementation(() => {
        if (calls++ === 0) throw new Error('transient');
        return {
          aiStream: new ReadableStream({ start: (c) => c.close() }),
          finishPromise: Promise.resolve(),

          settle: jest.fn(() => Promise.resolve('answer')),
          getFinishReason: () => undefined,
        };
      });

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
        agentMode: AgentMode.ASK,
        approvalMode: AgentApprovalMode.MANUAL,
        workspaceId: 'w1',
        userId: 'u1',
        deliveredSubagentIds: ['s1'],
      });
      const reader = stream.getReader();
      while (!(await reader.read()).done) {
        /* drain */
      }

      expect(service.executeStreamText).toHaveBeenCalledTimes(2);
      expect(service.subagents.releaseDelivery).not.toHaveBeenCalled();
    });

    it('repeats earlier results of the turn in later prompts', async () => {
      service.subagents.hasActive
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);
      service.subagents.takeUndelivered
        .mockResolvedValueOnce(finished)
        .mockResolvedValueOnce([
          { id: 's2', status: 'completed', sortOrder: 1 },
        ]);
      service.subagents.formatResultsMessage
        .mockReturnValueOnce('FIRST')
        .mockReturnValueOnce('SECOND');

      await run(AgentMode.ASK, AgentApprovalMode.MANUAL);

      const third = service.executeStreamText.mock.calls[2][0];
      expect(third.modelMessages.at(-1).content).toBe('FIRST\n\n---\n\nSECOND');
    });

    it('only waits for subagents dispatched in this turn', async () => {
      await run(AgentMode.ASK, AgentApprovalMode.MANUAL);

      expect(service.subagents.hasActive).toHaveBeenCalledWith(
        'c1',
        expect.any(Date),
      );
      expect(service.subagents.waitForSettled).not.toHaveBeenCalled();
    });

    /** An iteration whose run takes subagent results at a later step. */
    const iterationTakingResults =
      (
        handed: Array<string | undefined>,
        end: (c: ReadableStreamDefaultController) => void = (c) => c.close(),
        outcome = 'answer',
      ) =>
      (opts: { takeSubagentResults?: () => Promise<string | undefined> }) => {
        iteration();
        return {
          aiStream: new ReadableStream({
            start: async (c) => {
              handed.push(await opts.takeSubagentResults?.());
              end(c);
            },
          }),
          finishPromise: Promise.resolve(),
          settle: jest.fn(() => Promise.resolve(outcome)),
          getFinishReason: () => undefined,
        };
      };

    it('hands results that finish mid-iteration to its next step and repeats them later', async () => {
      repo.rows = [row('a', 'pending', 0), row('b', 'pending', 1)];
      const order = ['a', 'b'];
      iteration.mockImplementation(() =>
        setStatus(order.shift()!, 'completed'),
      );
      const handed: Array<string | undefined> = [];
      service.executeStreamText.mockImplementation(
        iterationTakingResults(handed),
      );
      service.subagents.takeUndelivered.mockResolvedValueOnce(finished);

      await run();

      expect(handed).toEqual(['RESULTS', undefined]);
      const second = service.executeStreamText.mock.calls[1][0];
      expect(second.modelMessages.at(-1).content).toContain('RESULTS');
      expect(service.subagents.releaseDelivery).not.toHaveBeenCalled();
    });

    it('releases results handed over mid-iteration when the iteration fails', async () => {
      repo.rows = [row('a', 'pending', 0)];
      service.executeStreamText.mockImplementation(
        // The run failed after a step: its partial answer is kept
        iterationTakingResults(
          [],
          (c) => c.error(new Error('connection reset')),
          'partial',
        ),
      );
      service.subagents.takeUndelivered.mockResolvedValueOnce(finished);

      await run();

      expect(service.subagents.releaseDelivery).toHaveBeenCalledWith(['s1']);
    });

    it('takes no results mid-iteration outside Agent mode', async () => {
      await run(AgentMode.ASK, AgentApprovalMode.MANUAL);

      expect(
        service.executeStreamText.mock.calls[0][0].takeSubagentResults,
      ).toBeUndefined();
    });

    it('forwards subagent updates and unsubscribes when the turn ends', async () => {
      const unsubscribe = jest.fn();
      service.subagents.subscribe.mockReturnValue(unsubscribe);

      await run(AgentMode.ASK, AgentApprovalMode.MANUAL);

      expect(service.subagents.subscribe).toHaveBeenCalledWith(
        'c1',
        expect.any(Function),
      );
      expect(unsubscribe).toHaveBeenCalled();
    });

    it("streams the subagents' browser pages as live screenshots", async () => {
      const unsubscribe = jest.fn();
      service.subagents.subscribeScreenshots.mockImplementation(
        (_id: string, listener: (shot: object) => void) => {
          listener({
            toolCallId: 't1',
            command: 'browser open x',
            image: 'jpg',
            subagent: { id: 's1', name: 'recon' },
          });
          return unsubscribe;
        },
      );

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
        agentMode: AgentMode.ASK,
        approvalMode: AgentApprovalMode.MANUAL,
        workspaceId: 'w1',
        userId: 'u1',
      });
      const chunks: Array<{ type: string; data?: unknown }> = [];
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toContainEqual(
        expect.objectContaining({
          type: 'data-browser-screenshot',
          transient: true,
          data: expect.objectContaining({
            subagent: { id: 's1', name: 'recon' },
          }),
        }),
      );
      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('turn stats', () => {
    it('persists the turn stats once when the model reported usage', async () => {
      service.executeStreamText.mockImplementation(
        (opts: { onStats?: (s: unknown) => void }) => {
          opts.onStats?.({ ...emptyStats(0), steps: 2, outputTokens: 10 });
          return {
            aiStream: new ReadableStream({ start: (c) => c.close() }),
            finishPromise: Promise.resolve(),

            settle: jest.fn(() => Promise.resolve('answer')),
            getFinishReason: () => undefined,
          };
        },
      );

      await run(AgentMode.ASK, AgentApprovalMode.MANUAL);

      expect(service.persistTurnMetadata).toHaveBeenCalledTimes(1);
      expect(service.persistTurnMetadata.mock.calls[0][2]).toMatchObject({
        steps: 2,
        outputTokens: 10,
      });
    });

    it('skips persisting when no step ran', async () => {
      await run(AgentMode.ASK, AgentApprovalMode.MANUAL);

      expect(service.persistTurnMetadata).not.toHaveBeenCalled();
    });
  });
});

describe('AgentsCompletionsService plan mode prompt', () => {
  const build = (
    agentMode: AgentMode,
    approvalMode: AgentApprovalMode,
    todos: TodoStatus[] = [],
    agentConfig: unknown = null,
    goal?: string,
    ltm = '',
  ) => {
    const service: any = Object.create(AgentsCompletionsService.prototype);
    service.getPrompt = jest.fn((name: string) => `prompt:${name}`);
    service.agentsMemories = {
      stmFormatForPrompt: jest.fn(() => Promise.resolve('')),
      ltmFormatForPrompt: jest.fn(() => Promise.resolve(ltm)),
    };
    service.agentsConfig = {
      find: jest.fn(() => Promise.resolve(agentConfig)),
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
      { id: 'c1', summary: null, approvalMode, metadata: { goal } },
      'w1',
      agentMode,
      'u1',
    ) as Promise<string[]>;
  };

  it("puts the user's instructions right after the shared system prompt", async () => {
    const parts = await build(AgentMode.ASK, AgentApprovalMode.MANUAL, [], {
      instruction: 'Report in tables.',
      memoryEnabled: true,
    });
    expect(parts.slice(0, 3)).toEqual([
      'prompt:ASK.md',
      'prompt:SYSTEM.md',
      '## User instructions\nReport in tables.',
    ]);
  });

  it('puts saved memories in the prompt only while memory is on', async () => {
    const ltm = '[Long-Term Memory]\n- fact';
    const withConfig = (config: unknown) =>
      build(AgentMode.ASK, AgentApprovalMode.MANUAL, [], config, undefined, ltm);
    expect(await withConfig({ memoryEnabled: true })).toContain(ltm);
    expect(await withConfig({ memoryEnabled: false })).not.toContain(ltm);
    // No config yet: memory is off by default
    expect(await withConfig(null)).not.toContain(ltm);
  });

  it.each([AgentApprovalMode.AUTO, AgentApprovalMode.MANUAL])(
    'asks for an approved plan first in Agent mode (%s)',
    async (mode) => {
      const parts = await build(AgentMode.AGENT, mode);
      // The last instruction; only the clock follows it
      const last = parts[parts.length - 2];
      expect(last).toContain('APPROVED PLAN FIRST');
      expect(last).toContain('The user reviews every new plan');
      expect(last).toContain('formulate_plan');
    },
  );

  it('ends with the time so the rest of the prompt can be cached', async () => {
    const parts = await build(AgentMode.AGENT, AgentApprovalMode.MANUAL);
    expect(parts[parts.length - 1]).toMatch(/^Current time: /);
  });

  it.each([AgentApprovalMode.AUTO, AgentApprovalMode.MANUAL])(
    'says nothing about plans in %s mode outside Agent mode, not even a finished one',
    async (mode) => {
      const parts = await build(AgentMode.ASK, mode, ['completed']);
      const text = parts.join('\n');
      expect(text).not.toContain('APPROVED PLAN FIRST');
      expect(text).not.toContain('prompt:PLAN.md');
      expect(text).not.toContain('step 0');
    },
  );

  it.each([AgentApprovalMode.AUTO, AgentApprovalMode.MANUAL])(
    'loads the plan prompt in Agent mode (%s) and pins the goal',
    async (mode) => {
      const empty = (await build(AgentMode.AGENT, mode)).join('\n');
      expect(empty).toContain('prompt:PLAN.md');

      const running = (
        await build(
          AgentMode.AGENT,
          mode,
          ['in_progress'],
          null,
          'Find open ports',
        )
      ).join('\n');
      expect(running).toContain('PINNED GOAL');
      expect(running).toContain('Find open ports');
    },
  );

  it('only lets a plan left from Agent mode finish in Ask mode', async () => {
    const parts = await build(AgentMode.ASK, AgentApprovalMode.MANUAL, [
      'completed',
      'pending',
    ]);
    const text = parts.join('\n');
    expect(text).toContain('AN APPROVED PLAN IS UNFINISHED');
    expect(text).not.toContain('APPROVED PLAN FIRST');
    expect(text).toContain('step 1');
  });
});

describe('subagents by agent mode', () => {
  const setup = () => {
    const service: any = Object.create(AgentsCompletionsService.prototype);
    service.subagents = {
      buildSubagentsPrompt: jest.fn(() =>
        Promise.resolve('## Available Subagents'),
      ),
      createTools: jest.fn(() => ({
        dispatch_subagent: {},
        get_subagent_result: {},
      })),
    };
    service.agentTool = { gateTools: jest.fn((tools: object) => tools) };
    const ctx = {
      conversationId: 'c1',
      workspaceId: 'w1',
      userId: 'u1',
      approval: {},
      todosEmitter: new EventEmitter(),
      onResultRead: jest.fn(),
    };
    return { service, ctx };
  };

  it('offers subagents in AGENT mode', async () => {
    const { service, ctx } = setup();
    await expect(
      service.getSubagentsPrompt(AgentMode.AGENT, 'w1', 'u1'),
    ).resolves.toBe('## Available Subagents');
    expect(Object.keys(service.getSubagentTools(AgentMode.AGENT, ctx))).toEqual(
      ['dispatch_subagent', 'get_subagent_result'],
    );
  });

  it('never starts subagents in ASK mode', async () => {
    const { service, ctx } = setup();
    await expect(
      service.getSubagentsPrompt(AgentMode.ASK, 'w1', 'u1'),
    ).resolves.toBe('');
    expect(service.getSubagentTools(AgentMode.ASK, ctx)).toEqual({});
    expect(service.subagents.buildSubagentsPrompt).not.toHaveBeenCalled();
    expect(service.subagents.createTools).not.toHaveBeenCalled();
  });
});

describe('withStepResults', () => {
  const messages = [{ role: 'user', content: 'scan example.com' }];
  const prepare = (
    limit: ReturnType<typeof stepLimit>,
    take: () => Promise<string | undefined>,
    stepNumber: number,
  ) =>
    withStepResults(limit, take).prepareStep!({
      stepNumber,
      instructions: 'sys',
      messages,
    } as any);

  it('changes nothing without a source of results', () => {
    const limit = stepLimit(3, { forceSummary: false });
    expect(withStepResults(limit)).toBe(limit);
  });

  it('leaves the first step alone', async () => {
    const take = jest.fn(() => Promise.resolve('RESULTS'));
    await expect(
      prepare(stepLimit(5, { forceSummary: false }), take, 0),
    ).resolves.toEqual({});
    expect(take).not.toHaveBeenCalled();
  });

  it('adds results that finished to a later step as a user message', async () => {
    const limit = stepLimit(5, { forceSummary: false });
    await expect(
      prepare(limit, () => Promise.resolve('RESULTS'), 1),
    ).resolves.toEqual({
      messages: [...messages, { role: 'user', content: 'RESULTS' }],
    });
    await expect(
      prepare(limit, () => Promise.resolve(undefined), 2),
    ).resolves.toEqual({});
  });

  it('keeps the forced summary of the last step', async () => {
    await expect(
      prepare(stepLimit(3), () => Promise.resolve('RESULTS'), 2),
    ).resolves.toMatchObject({
      toolChoice: 'none',
      messages: [...messages, { role: 'user', content: 'RESULTS' }],
    });
  });
});

describe('planning state', () => {
  const todo = (status: TodoStatus) => ({ status });

  it('plans in Agent mode only', () => {
    expect(planningState([], AgentMode.AGENT)).toBe('track');
    expect(planningState([todo('pending')], AgentMode.AGENT)).toBe('track');
    expect(planningState([], AgentMode.ASK)).toBe('off');
    expect(planningState([todo('completed')], AgentMode.ASK)).toBe('off');
  });

  it('finishes a plan approved earlier', () => {
    expect(
      planningState([todo('completed'), todo('pending')], AgentMode.ASK),
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
    expect(tools('track')).toHaveLength(4);
    expect(service.agentTool.getTodoTools).toHaveBeenLastCalledWith(
      'c1',
      expect.any(EventEmitter),
      { selfManaged: true },
    );
  });
});

describe('generateGoal', () => {
  const makeService = (overrides: Record<string, unknown> = {}) => {
    const service: any = Object.create(AgentsCompletionsService.prototype);
    service.goaling = new Set<string>();
    service.getPrompt = jest.fn(() => 'prompt');
    service.createLanguageModel = jest.fn(() => Promise.resolve({}));
    service.completeText = jest.fn(() =>
      Promise.resolve(
        '"Find the open ports of example.com"\nignored second line',
      ),
    );
    service.todoRepository = {
      exists: jest.fn(() => Promise.resolve(false)),
      find: jest.fn(() => Promise.resolve([])),
    };
    let metadata: Record<string, unknown> | null = null;
    service.conversationRepository = {
      manager: {
        transaction: jest.fn((cb: (m: unknown) => unknown) =>
          cb({
            findOne: () => Promise.resolve({ id: 'c1', metadata }),
            update: (
              _e: unknown,
              _w: unknown,
              set: { metadata: typeof metadata },
            ) => {
              metadata = set.metadata;
              return Promise.resolve();
            },
          }),
        ),
      },
    };
    Object.assign(service, overrides);
    return { service, meta: () => metadata };
  };

  const llmConfig = { workspaceId: 'w1', provider: 'openai' } as never;

  it('streams a one-line goal and pins it on the conversation', async () => {
    const { service, meta } = makeService();
    const emitter = new EventEmitter();
    const emitted = jest.fn();
    emitter.on('todos-updated', emitted);

    await service.generateGoal('c1', llmConfig, 'scan example.com', emitter);

    // First line, surrounding quotes stripped
    expect(emitted).toHaveBeenCalledWith(
      [],
      'Find the open ports of example.com',
    );
    expect(meta()).toMatchObject({
      goal: 'Find the open ports of example.com',
    });
  });

  it('does not clobber the goal of a plan already running', async () => {
    const { service, meta } = makeService({
      todoRepository: {
        exists: jest.fn(() => Promise.resolve(true)),
        find: jest.fn(() => Promise.resolve([])),
      },
    });
    const emitter = new EventEmitter();
    const emitted = jest.fn();
    emitter.on('todos-updated', emitted);

    await service.generateGoal('c1', llmConfig, 'scan example.com', emitter);

    expect(emitted).not.toHaveBeenCalled();
    expect(meta()).toBeNull();
  });
});
