import {
  AgentApprovalMode,
  AgentCommandApprovalStatus,
} from '@/common/enums/enum';
import { EventEmitter } from 'node:events';
import type { FindOperator } from 'typeorm';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { COMMAND_PREVIEW_LENGTH } from './dto/command-approval.dto';
import {
  APPROVAL_TIMEOUT_MS,
  AgentsApprovalsService,
  type ApprovalContext,
} from './agents.approvals';
import type { AgentCommandApproval } from './entities/agent-command-approval.entity';

describe('AgentsApprovalsService', () => {
  let rows: AgentCommandApproval[];
  let repo: Record<string, jest.Mock>;
  let redisStore: Map<string, string>;
  let redisSets: Map<string, Set<string>>;
  let redisDown: boolean;
  let service: AgentsApprovalsService;

  const ctx = (mode: AgentApprovalMode): ApprovalContext => ({
    userId: 'u1',
    workspaceId: 'w1',
    conversationId: 'c1',
    mode,
  });

  // Some tests leave prompts unanswered; fake timers drop their 5 min timeouts
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    rows = [];
    const matches = (r: AgentCommandApproval, where: object) =>
      Object.entries(where).every(([k, v]) => (r as never)[k] === v);
    repo = {
      findOne: jest.fn(({ where }) =>
        Promise.resolve(
          rows.find((r) =>
            Object.entries(where).every(([k, v]) => (r as never)[k] === v),
          ) ?? null,
        ),
      ),
      create: jest.fn((v: Partial<AgentCommandApproval>) => v),
      save: jest.fn((v) => {
        v.id ??= `a${rows.length + 1}`;
        if (!rows.includes(v)) rows.push(v);
        return Promise.resolve(v);
      }),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn((where: object) => {
        rows = rows.filter((r) => !matches(r, where));
        return Promise.resolve();
      }),
      remove: jest.fn(),
      findAndCount: jest.fn(() => Promise.resolve([rows, rows.length])),
    };
    redisStore = new Map();
    redisSets = new Map();
    redisDown = false;
    const guard = () => {
      if (redisDown) throw new Error('ECONNREFUSED');
    };
    const cacheClient = {
      exists: jest.fn((...keys: string[]) => {
        guard();
        return Promise.resolve(keys.filter((k) => redisStore.has(k)).length);
      }),
      set: jest.fn((key: string, value: string) => {
        guard();
        redisStore.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((...keys: string[]) => {
        guard();
        keys.forEach((k) => {
          redisStore.delete(k);
          redisSets.delete(k);
        });
        return Promise.resolve(keys.length);
      }),
      sadd: jest.fn((key: string, member: string) => {
        guard();
        redisSets.set(key, new Set([...(redisSets.get(key) ?? []), member]));
        return Promise.resolve(1);
      }),
      sismember: jest.fn((key: string, member: string) => {
        guard();
        return Promise.resolve(redisSets.get(key)?.has(member) ? 1 : 0);
      }),
      expire: jest.fn(() => Promise.resolve(1)),
    };
    service = new AgentsApprovalsService(
      repo as never,
      { cacheClient } as never,
    );
  });

  it('only ignores surrounding whitespace when hashing commands', () => {
    expect(AgentsApprovalsService.hash('  nmap -sV host\n')).toBe(
      AgentsApprovalsService.hash('nmap -sV host'),
    );
    expect(AgentsApprovalsService.hash('printf "a  b"')).not.toBe(
      AgentsApprovalsService.hash('printf "a b"'),
    );
  });

  it('runs everything in auto mode', async () => {
    await expect(
      service.authorize('rm -rf /', 't1', ctx(AgentApprovalMode.AUTO)),
    ).resolves.toEqual({ allowed: true });
    expect(rows).toHaveLength(0);
  });

  it('blocks in manual mode until the user approves, then remembers it', async () => {
    const emitter = new EventEmitter();
    emitter.on('approval-required', (e: { approvalId: string }) => {
      void service.decide(
        e.approvalId,
        AgentCommandApprovalStatus.APPROVED,
        'w1',
        'u1',
      );
    });

    await expect(
      service.authorize('nmap host', 't1', ctx(AgentApprovalMode.MANUAL), emitter),
    ).resolves.toEqual({ allowed: true });

    // identical command now passes without a new prompt
    const prompt = jest.fn();
    emitter.on('approval-required', prompt);
    await expect(
      service.authorize(' nmap host ', 't2', ctx(AgentApprovalMode.MANUAL), emitter),
    ).resolves.toEqual({ allowed: true });
    expect(prompt).not.toHaveBeenCalled();
  });

  it('shares one prompt between parallel calls of the same command', async () => {
    const emitter = new EventEmitter();
    const prompt = jest.fn((e: { approvalId: string }) => {
      void service.decide(
        e.approvalId,
        AgentCommandApprovalStatus.APPROVED,
        'w1',
        'u1',
      );
    });
    emitter.on('approval-required', prompt);

    const results = await Promise.all([
      service.authorize('nmap host', 't1', ctx(AgentApprovalMode.MANUAL), emitter),
      service.authorize('nmap host', 't2', ctx(AgentApprovalMode.MANUAL), emitter),
    ]);

    expect(results).toEqual([{ allowed: true }, { allowed: true }]);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  it('refuses when the user rejects', async () => {
    const emitter = new EventEmitter();
    emitter.on('approval-required', (e: { approvalId: string }) => {
      void service.decide(
        e.approvalId,
        AgentCommandApprovalStatus.REJECTED,
        'w1',
        'u1',
      );
    });
    await expect(
      service.authorize('nuclei -u x', 't1', ctx(AgentApprovalMode.MANUAL), emitter),
    ).resolves.toMatchObject({ allowed: false });
  });

  it('asks for every new command in plan mode until a plan is approved', async () => {
    const emitter = new EventEmitter();
    const prompt = jest.fn((e: { approvalId: string }) => {
      void service.decide(
        e.approvalId,
        AgentCommandApprovalStatus.APPROVED,
        'w1',
        'u1',
      );
    });
    emitter.on('approval-required', prompt);
    await service.authorize('a', 't1', ctx(AgentApprovalMode.PLAN), emitter);
    await service.authorize('b', 't2', ctx(AgentApprovalMode.PLAN), emitter);
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('refuses without asking in plan-first runs until a plan is approved', async () => {
    const emitter = new EventEmitter();
    const prompt = jest.fn();
    emitter.on('approval-required', prompt);
    await expect(
      service.authorize(
        'nmap host',
        't1',
        { ...ctx(AgentApprovalMode.PLAN), planFirst: true },
        emitter,
      ),
    ).resolves.toEqual({ allowed: false, planRequired: true });
    expect(prompt).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);

    // once the approved plan switched the run to auto, it just runs
    await expect(
      service.authorize(
        'nmap host',
        't2',
        { ...ctx(AgentApprovalMode.AUTO), planFirst: true },
        emitter,
      ),
    ).resolves.toEqual({ allowed: true });
  });

  describe('plan approval', () => {
    const steps = ['Enumerate subdomains', 'Scan open ports'];

    const ask = (emitter: EventEmitter, signal?: AbortSignal) =>
      service.requestPlanApproval(
        steps,
        't1',
        ctx(AgentApprovalMode.PLAN),
        emitter,
        signal,
      );

    it('shows the plan and returns the run mode the user picked', async () => {
      const emitter = new EventEmitter();
      const events: Array<Record<string, unknown>> = [];
      emitter.on('approval-required', (e: { approvalId: string }) => {
        events.push(e);
        service.decidePlan(e.approvalId, 'w1', 'u1', {
          allowed: true,
          mode: AgentApprovalMode.AUTO,
        });
      });

      await expect(ask(emitter)).resolves.toEqual({
        allowed: true,
        mode: AgentApprovalMode.AUTO,
      });
      expect(events[0]).toMatchObject({
        kind: 'plan',
        tool: 'formulate_plan',
        toolCallId: 't1',
        plan: steps,
      });
      // plans are one-off: nothing is remembered
      expect(rows).toHaveLength(0);
    });

    it('defaults an approval to manual mode', async () => {
      const emitter = new EventEmitter();
      emitter.on('approval-required', (e: { approvalId: string }) => {
        service.decidePlan(e.approvalId, 'w1', 'u1', { allowed: true });
      });
      await expect(ask(emitter)).resolves.toEqual({
        allowed: true,
        mode: AgentApprovalMode.MANUAL,
      });
    });

    it('passes the rejection message back to the agent', async () => {
      const emitter = new EventEmitter();
      emitter.on('approval-required', (e: { approvalId: string }) => {
        service.decidePlan(e.approvalId, 'w1', 'u1', {
          allowed: false,
          mode: AgentApprovalMode.AUTO,
          feedback: 'skip the port scan',
        });
      });
      await expect(ask(emitter)).resolves.toEqual({
        allowed: false,
        feedback: 'skip the port scan',
      });
    });

    it('rejects when the client leaves or nobody answers', async () => {
      const abort = new AbortController();
      const left = ask(new EventEmitter(), abort.signal);
      abort.abort();
      await expect(left).resolves.toEqual({ allowed: false });

      const ignored = ask(new EventEmitter());
      jest.advanceTimersByTime(APPROVAL_TIMEOUT_MS);
      await expect(ignored).resolves.toEqual({ allowed: false });

      await expect(service.requestPlanApproval(steps, 't1', ctx(AgentApprovalMode.PLAN))).resolves.toEqual({ allowed: false });
    });

    it("does not let another user decide someone else's plan", () => {
      const emitter = new EventEmitter();
      let approvalId = '';
      emitter.on('approval-required', (e: { approvalId: string }) => {
        approvalId = e.approvalId;
      });
      void ask(emitter);

      expect(() =>
        service.decidePlan(approvalId, 'w1', 'u2', { allowed: true }),
      ).toThrow('Plan approval not found');
      expect(() =>
        service.decidePlan(approvalId, 'w2', 'u1', { allowed: true }),
      ).toThrow('Plan approval not found');
      expect(() =>
        service.decidePlan('unknown', 'w1', 'u1', { allowed: true }),
      ).toThrow('Plan approval not found');
    });

    it('answers a plan once', async () => {
      const emitter = new EventEmitter();
      let approvalId = '';
      emitter.on('approval-required', (e: { approvalId: string }) => {
        approvalId = e.approvalId;
      });
      const decision = ask(emitter);
      service.decidePlan(approvalId, 'w1', 'u1', { allowed: true });
      await decision;
      expect(() =>
        service.decidePlan(approvalId, 'w1', 'u1', { allowed: false }),
      ).toThrow('Plan approval not found');
    });
  });

  it('keeps "allow all" until the mode changes', async () => {
    const emitter = new EventEmitter();
    const prompt = jest.fn((e: { approvalId: string }) => {
      void service.decide(
        e.approvalId,
        AgentCommandApprovalStatus.APPROVED,
        'w1',
        'u1',
        { allowConversation: true },
      );
    });
    emitter.on('approval-required', prompt);
    await service.authorize('a', 't1', ctx(AgentApprovalMode.MANUAL), emitter);
    await service.authorize('b', 't2', ctx(AgentApprovalMode.PLAN), emitter);
    expect(prompt).toHaveBeenCalledTimes(1);

    await service.resetConversation('c1');
    await service.authorize('c', 't3', ctx(AgentApprovalMode.MANUAL), emitter);
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('persists conversation approvals in redis with a ttl', async () => {
    const emitter = new EventEmitter();
    emitter.on('approval-required', (e: { approvalId: string }) => {
      void service.decide(
        e.approvalId,
        AgentCommandApprovalStatus.APPROVED,
        'w1',
        'u1',
        { allowConversation: true },
      );
    });
    await service.authorize('a', 't1', ctx(AgentApprovalMode.MANUAL), emitter);
    expect([...redisStore.keys()]).toEqual(['agents:approval:all:c1']);
  });

  it('asks again when redis is unavailable', async () => {
    const emitter = new EventEmitter();
    const prompt = jest.fn((e: { approvalId: string }) => {
      void service.decide(
        e.approvalId,
        AgentCommandApprovalStatus.APPROVED,
        'w1',
        'u1',
        { allowConversation: true },
      );
    });
    emitter.on('approval-required', prompt);
    await service.authorize('a', 't1', ctx(AgentApprovalMode.MANUAL), emitter);

    redisDown = true;
    await expect(
      service.authorize('b', 't2', ctx(AgentApprovalMode.MANUAL), emitter),
    ).resolves.toEqual({ allowed: true });
    expect(prompt).toHaveBeenCalledTimes(2);
    await expect(service.resetConversation('c1')).rejects.toThrow(
      'ECONNREFUSED',
    );
  });

  it('passes the rejection message back to the agent', async () => {
    const emitter = new EventEmitter();
    emitter.on('approval-required', (e: { approvalId: string }) => {
      void service.decide(
        e.approvalId,
        AgentCommandApprovalStatus.REJECTED,
        'w1',
        'u1',
        { feedback: 'use a lighter scan' },
      );
    });
    await expect(
      service.authorize('nmap -p-', 't1', ctx(AgentApprovalMode.MANUAL), emitter),
    ).resolves.toEqual({ allowed: false, feedback: 'use a lighter scan' });
  });

  it('keeps conversations waiting on the same command independent', async () => {
    const ids: string[] = [];
    const emitter = new EventEmitter();
    emitter.on('approval-required', (e: { approvalId: string }) => {
      ids.push(e.approvalId);
    });
    const abort = new AbortController();
    const inA = service.authorize(
      'nmap host',
      't1',
      { ...ctx(AgentApprovalMode.MANUAL), conversationId: 'cA' },
      emitter,
      undefined,
      abort.signal,
    );
    await new Promise((r) => setImmediate(r));
    const inB = service.authorize(
      'nmap host',
      't2',
      { ...ctx(AgentApprovalMode.MANUAL), conversationId: 'cB' },
      emitter,
    );
    await new Promise((r) => setImmediate(r));

    // each conversation shows its own prompt and keeps its own row
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(rows).toHaveLength(2);

    // A's client leaves; that must not strand or reject B
    abort.abort();
    await expect(inA).resolves.toMatchObject({ allowed: false });

    await service.decide(ids[1], AgentCommandApprovalStatus.APPROVED, 'w1', 'u1', {
      allowConversation: true,
    });
    await expect(inB).resolves.toEqual({ allowed: true });

    // "allow all" applied to B, the conversation that was asked, not A
    const prompt = jest.fn();
    emitter.on('approval-required', prompt);
    void service.authorize(
      'other',
      't3',
      { ...ctx(AgentApprovalMode.MANUAL), conversationId: 'cA' },
      emitter,
    );
    await new Promise((r) => setImmediate(r));
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("does not let another user decide someone else's prompt", async () => {
    const emitter = new EventEmitter();
    let approvalId = '';
    emitter.on('approval-required', (e: { approvalId: string }) => {
      approvalId = e.approvalId;
    });
    void service.authorize('nmap host', 't1', ctx(AgentApprovalMode.MANUAL), emitter);
    await new Promise((r) => setImmediate(r));

    await expect(
      service.decide(approvalId, AgentCommandApprovalStatus.APPROVED, 'w1', 'u2'),
    ).rejects.toThrow('Approval not found');
  });

  it('remembers approvals per conversation', async () => {
    const emitter = new EventEmitter();
    const prompt = jest.fn((e: { approvalId: string }) => {
      void service.decide(
        e.approvalId,
        AgentCommandApprovalStatus.APPROVED,
        'w1',
        'u1',
      );
    });
    emitter.on('approval-required', prompt);
    await service.authorize('nmap host', 't1', ctx(AgentApprovalMode.MANUAL), emitter);
    expect(prompt).toHaveBeenCalledTimes(1);

    // the same conversation does not ask again
    await expect(
      service.authorize('nmap host', 't2', ctx(AgentApprovalMode.MANUAL), emitter),
    ).resolves.toEqual({ allowed: true });
    expect(prompt).toHaveBeenCalledTimes(1);

    // another conversation, even in the same workspace, asks again
    emitter.removeAllListeners();
    const other = jest.fn();
    emitter.on('approval-required', other);
    void service.authorize(
      'nmap host',
      't3',
      { ...ctx(AgentApprovalMode.MANUAL), conversationId: 'c2' },
      emitter,
    );
    await new Promise((r) => setImmediate(r));
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('allows everything in the conversation, including queued requests', async () => {
    const emitter = new EventEmitter();
    const ids: string[] = [];
    emitter.on('approval-required', (e: { approvalId: string }) => {
      ids.push(e.approvalId);
    });
    const first = service.authorize('a', 't1', ctx(AgentApprovalMode.MANUAL), emitter);
    const second = service.authorize('b', 't2', ctx(AgentApprovalMode.MANUAL), emitter);
    await new Promise((r) => setImmediate(r));
    expect(ids).toHaveLength(2);

    await service.decide(ids[0], AgentCommandApprovalStatus.APPROVED, 'w1', 'u1', {
      allowConversation: true,
    });
    await expect(first).resolves.toEqual({ allowed: true });
    await expect(second).resolves.toEqual({ allowed: true });

    await expect(
      service.authorize('c', 't3', ctx(AgentApprovalMode.MANUAL), emitter),
    ).resolves.toEqual({ allowed: true });
  });

  it('forgets a prompt nobody answered but keeps real rejections', async () => {
    const ignored = service.authorize(
      'nmap host',
      't1',
      ctx(AgentApprovalMode.MANUAL),
      new EventEmitter(),
    );
    await new Promise((r) => setImmediate(r));
    expect(rows).toHaveLength(1);
    jest.advanceTimersByTime(APPROVAL_TIMEOUT_MS);
    await expect(ignored).resolves.toEqual({ allowed: false });
    expect(rows).toHaveLength(0);

    const emitter = new EventEmitter();
    emitter.on('approval-required', (e: { approvalId: string }) => {
      void service.decide(
        e.approvalId,
        AgentCommandApprovalStatus.REJECTED,
        'w1',
        'u1',
      );
    });
    await service.authorize('nmap host', 't2', ctx(AgentApprovalMode.MANUAL), emitter);
    expect(rows).toEqual([
      expect.objectContaining({ status: AgentCommandApprovalStatus.REJECTED }),
    ]);
  });

  describe('list', () => {
    it('pages, filters and searches literally', async () => {
      await service.list('w1', 'u1', {
        page: 3,
        limit: 20,
        search: '100%_done',
        status: AgentCommandApprovalStatus.APPROVED,
        sortBy: 'createdAt',
        sortOrder: SortOrder.ASC,
      });
      const [options] = repo.findAndCount.mock.calls[0] as [
        {
          where: Record<string, unknown>;
          order: Record<string, string>;
          skip: number;
          take: number;
        },
      ];
      expect(options).toMatchObject({
        where: {
          workspaceId: 'w1',
          userId: 'u1',
          status: AgentCommandApprovalStatus.APPROVED,
        },
        order: { createdAt: SortOrder.ASC, id: 'ASC' },
        skip: 40,
        take: 20,
      });
      expect((options.where.command as FindOperator<string>).value).toBe(
        '%100\\%\\_done%',
      );
    });

    it('returns a page with truncated commands', async () => {
      const now = new Date();
      rows.push({
        id: 'a1',
        userId: 'u1',
        workspaceId: 'w1',
        hash: 'h',
        command: 'x'.repeat(COMMAND_PREVIEW_LENGTH + 5),
        status: AgentCommandApprovalStatus.APPROVED,
        createdAt: now,
        updatedAt: now,
      });
      const result = await service.list('w1', 'u1', {
        page: 1,
        limit: 10,
        sortBy: 'updatedAt',
      });
      expect(result).toMatchObject({
        total: 1,
        page: 1,
        limit: 10,
        hasNextPage: false,
      });
      expect(result.data[0].command).toHaveLength(COMMAND_PREVIEW_LENGTH + 1);
      expect(result.data[0].command.endsWith('…')).toBe(true);
      expect(result.data[0].commandTruncated).toBe(true);
      expect(result.data[0]).not.toHaveProperty('hash');
    });
  });

  it('forgets the approvals and "allow all" of deleted conversations', async () => {
    const emitter = new EventEmitter();
    const waiting = service.authorize('a', 't1', ctx(AgentApprovalMode.MANUAL), emitter);
    await new Promise((r) => setImmediate(r));
    redisStore.set('agents:approval:all:c1', '1');

    await service.forgetConversations(['c1'], 'w1', 'u1');

    await expect(waiting).resolves.toMatchObject({ allowed: false });
    expect(repo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', userId: 'u1' }),
    );
    expect(redisStore.has('agents:approval:all:c1')).toBe(false);
  });

  describe('large inputs', () => {
    const big = (tail: string) => `scan ${'x'.repeat(50_000)}${tail}`;

    it('stores a preview but matches on the whole input', async () => {
      const emitter = new EventEmitter();
      const prompt = jest.fn((e: { approvalId: string }) => {
        void service.decide(
          e.approvalId,
          AgentCommandApprovalStatus.APPROVED,
          'w1',
          'u1',
        );
      });
      emitter.on('approval-required', prompt);
      await service.authorize(big('A'), 't1', ctx(AgentApprovalMode.MANUAL), emitter);
      expect(rows[0].command).toHaveLength(COMMAND_PREVIEW_LENGTH + 1);

      // identical: remembered
      await service.authorize(big('A'), 't2', ctx(AgentApprovalMode.MANUAL), emitter);
      expect(prompt).toHaveBeenCalledTimes(1);

      // differs only past the preview: asks again
      await service.authorize(big('B'), 't3', ctx(AgentApprovalMode.MANUAL), emitter);
      expect(prompt).toHaveBeenCalledTimes(2);
    });

    it('sends the full input once, with the command only as a label', async () => {
      const events: { command: string; input?: unknown }[] = [];
      const emitter = new EventEmitter();
      emitter.on('approval-required', (e: { command: string }) => events.push(e));
      const input = { data: 'x'.repeat(50_000) };

      void service.authorize(
        `upload ${JSON.stringify(input)}`,
        't1',
        ctx(AgentApprovalMode.MANUAL),
        emitter,
        { tool: 'upload', input },
      );
      void service.authorize(
        big('shell'),
        't2',
        ctx(AgentApprovalMode.MANUAL),
        emitter,
        { tool: 'execute_remote_command' },
      );
      await new Promise((r) => setImmediate(r));

      expect(events[0].command).toHaveLength(COMMAND_PREVIEW_LENGTH + 1);
      expect(events[0].input).toBe(input);
      // a shell command is what the user reviews: never cut
      expect(events[1].command).toBe(big('shell'));
      expect(events[1].input).toBeUndefined();
    });
  });

  describe('allow a tool for the conversation', () => {
    const call = (
      command: string,
      tool: string,
      emitter: EventEmitter,
      conversationId = 'c1',
    ) =>
      service.authorize(
        command,
        command,
        { ...ctx(AgentApprovalMode.MANUAL), conversationId },
        emitter,
        { tool, input: {} },
      );

    it('approves queued and later calls of that tool only', async () => {
      const emitter = new EventEmitter();
      const prompts: { approvalId: string; tool?: string }[] = [];
      const resolved: string[] = [];
      emitter.on('approval-required', (e: { approvalId: string }) => prompts.push(e));
      emitter.on('approval-resolved', (e: { approvalId: string }) =>
        resolved.push(e.approvalId),
      );

      const first = call('fetch {"url":"a"}', 'fetch', emitter);
      const queued = call('fetch {"url":"b"}', 'fetch', emitter);
      const other = call('scan {}', 'scan', emitter);
      await new Promise((r) => setImmediate(r));
      expect(prompts).toHaveLength(3);

      await service.decide(prompts[0].approvalId, AgentCommandApprovalStatus.APPROVED, 'w1', 'u1', {
        allowTool: true,
      });
      await expect(first).resolves.toEqual({ allowed: true });
      await expect(queued).resolves.toEqual({ allowed: true });
      // the UI is told both prompts are answered; the other tool still waits
      expect(resolved).toEqual([prompts[0].approvalId, prompts[1].approvalId]);

      // a new input for the allowed tool passes without asking
      await expect(call('fetch {"url":"c"}', 'fetch', emitter)).resolves.toEqual({
        allowed: true,
      });
      expect(prompts).toHaveLength(3);

      // not in another conversation
      void call('fetch {"url":"c"}', 'fetch', emitter, 'c2');
      await new Promise((r) => setImmediate(r));
      expect(prompts).toHaveLength(4);

      await service.decide(prompts[2].approvalId, AgentCommandApprovalStatus.REJECTED, 'w1', 'u1');
      await expect(other).resolves.toMatchObject({ allowed: false });
    });

    it('forgets allowed tools when the mode changes', async () => {
      const emitter = new EventEmitter();
      emitter.on('approval-required', (e: { approvalId: string }) => {
        void service.decide(e.approvalId, AgentCommandApprovalStatus.APPROVED, 'w1', 'u1', {
          allowTool: true,
        });
      });
      await call('fetch {"url":"a"}', 'fetch', emitter);
      await service.resetConversation('c1');

      const prompt = jest.fn();
      emitter.removeAllListeners();
      emitter.on('approval-required', prompt);
      void call('fetch {"url":"b"}', 'fetch', emitter);
      await new Promise((r) => setImmediate(r));
      expect(prompt).toHaveBeenCalledTimes(1);
    });
  });

  describe('read-only tools', () => {
    it('run without asking in manual mode', async () => {
      const prompt = jest.fn();
      const emitter = new EventEmitter();
      emitter.on('approval-required', prompt);
      await expect(
        service.authorize('enumerate_assets {}', 't1', ctx(AgentApprovalMode.MANUAL), emitter, {
          tool: 'enumerate_assets',
          readOnly: true,
        }),
      ).resolves.toEqual({ allowed: true });
      expect(prompt).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    });

    it('still wait for the plan in plan mode', async () => {
      await expect(
        service.authorize(
          'enumerate_assets {}',
          't1',
          { ...ctx(AgentApprovalMode.PLAN), planFirst: true },
          undefined,
          { tool: 'enumerate_assets', readOnly: true },
        ),
      ).resolves.toEqual({ allowed: false, planRequired: true });
    });
  });
});
