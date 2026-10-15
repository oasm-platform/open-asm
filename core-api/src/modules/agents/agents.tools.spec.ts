import { AgentApprovalMode, AgentMode, WorkerType } from '@/common/enums/enum';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'node:events';
import { AgentsMcpService, getMcpToolMetadata } from './agents.mcp';
import type { AgentsService } from './agents.service';
import { AgentTool, pageToolOutput, stableStringify } from './agents.tools';

describe('MCP tool metadata', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves standard annotations and uses the MCP title precedence', () => {
    expect(
      getMcpToolMetadata('partner', {
        name: 'scan',
        title: 'Partner scan',
        description: 'Scan a partner target',
        inputSchema: { type: 'object' },
        annotations: {
          title: 'Legacy scan title',
          destructiveHint: true,
          openWorldHint: true,
        },
      }),
    ).toEqual({
      source: 'mcp',
      server: 'partner',
      name: 'scan',
      title: 'Partner scan',
      annotations: {
        title: 'Legacy scan title',
        destructiveHint: true,
        openWorldHint: true,
      },
    });
  });

  it('only exposes MCP tools allowed by the server configuration', async () => {
    jest.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
    jest.spyOn(Client.prototype, 'close').mockResolvedValue(undefined);
    jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
      tools: [
        { name: 'scan', inputSchema: { type: 'object' } },
        { name: 'delete', inputSchema: { type: 'object' } },
      ],
    });
    const agentsService = {
      getMCPConfig: jest.fn().mockResolvedValue({
        servers: [
          {
            name: 'partner',
            url: 'http://localhost/mcp',
            transport: 'streamable-http',
            allowed_tools: ['scan'],
          },
        ],
      }),
    } as unknown as AgentsService;

    const tools = await new AgentsMcpService(agentsService).getTools(
      'workspace-1',
    );

    expect(Object.keys(tools)).toEqual(['partner_scan']);
  });
});

describe('AgentTool external MCP approvals', () => {
  const approval = {
    userId: 'user-1',
    mode: AgentApprovalMode.MANUAL,
  };

  function createTool(authorize: jest.Mock) {
    return Object.assign(Object.create(AgentTool.prototype), {
      approvals: { authorize },
    }) as AgentTool;
  }

  it('passes MCP metadata and description through to the approval request', async () => {
    const authorize = jest.fn().mockResolvedValue({ allowed: true });
    const execute = jest.fn().mockResolvedValue({ ok: true });
    const agentTool = createTool(authorize);
    const emitter = new EventEmitter();
    const wrapped = agentTool.wrapExternalToolsWithApproval(
      {
        partner_scan: {
          description: 'Scan an external partner target. Returns findings.',
          metadata: {
            source: 'mcp',
            server: 'partner',
            name: 'scan',
            title: 'Partner scan',
            annotations: { destructiveHint: true },
          },
          execute,
        },
      },
      'workspace-1',
      'conversation-1',
      approval,
      emitter,
    );
    const input = { target: 'example.com' };
    const options = { toolCallId: 'call-1' };

    await expect(wrapped.partner_scan.execute(input, options)).resolves.toEqual(
      {
        ok: true,
      },
    );
    expect(authorize).toHaveBeenCalledWith(
      'partner_scan {"target":"example.com"}',
      'call-1',
      {
        userId: 'user-1',
        mode: AgentApprovalMode.MANUAL,
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
      },
      emitter,
      {
        tool: 'partner_scan',
        description: 'Scan an external partner target. Returns findings.',
        toolMetadata: {
          source: 'mcp',
          server: 'partner',
          name: 'scan',
          title: 'Partner scan',
          annotations: { destructiveHint: true },
        },
        input,
        readOnly: false,
      },
      undefined,
    );
    expect(execute).toHaveBeenCalledWith(input, options);
  });

  it('does not invent a description when an MCP server omits it', async () => {
    const authorize = jest.fn().mockResolvedValue({ allowed: false });
    const execute = jest.fn();
    const agentTool = createTool(authorize);
    const wrapped = agentTool.wrapExternalToolsWithApproval(
      { partner_unknown: { execute } },
      'workspace-1',
      'conversation-1',
      approval,
    );

    await expect(
      wrapped.partner_unknown.execute({}, { toolCallId: 'call-2' }),
    ).resolves.toEqual({
      error: 'Tool call was not approved by the user and was not executed.',
    });
    expect(authorize.mock.calls[0][4]).toMatchObject({
      tool: 'partner_unknown',
      description: undefined,
      toolMetadata: undefined,
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('approval matching', () => {
  const approval = { userId: 'user-1', mode: AgentApprovalMode.MANUAL };

  type Wrapped = {
    execute: (
      params: unknown,
      options: { toolCallId: string },
    ) => Promise<unknown>;
  };
  const wrap = (authorize: jest.Mock, metadata?: Record<string, unknown>) =>
    (
      Object.assign(Object.create(AgentTool.prototype), {
        approvals: { authorize },
      }) as AgentTool
    ).wrapExternalToolsWithApproval(
      { partner_scan: { metadata, execute: jest.fn() } },
      'workspace-1',
      'conversation-1',
      approval,
    ).partner_scan as Wrapped;

  it('ignores the order the model wrote the arguments in', () => {
    expect(stableStringify({ b: 1, a: { d: [{ y: 1, x: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[{"x":2,"y":1}]},"b":1}',
    );
  });

  it('matches arguments by content, not key order', async () => {
    const authorize = jest.fn().mockResolvedValue({ allowed: true });
    const tool = wrap(authorize);
    await tool.execute({ b: 2, a: 1 }, { toolCallId: 'c1' });
    await tool.execute({ a: 1, b: 2 }, { toolCallId: 'c2' });
    const [first, second] = (authorize.mock.calls as [string][]).map(
      ([command]) => command,
    );
    expect(first).toBe('partner_scan {"a":1,"b":2}');
    expect(second).toBe(first);
  });

  it.each([
    [{ readOnlyHint: true }, true],
    [{ readOnlyHint: true, openWorldHint: false }, true],
    [{ readOnlyHint: true, openWorldHint: true }, false],
    [{ destructiveHint: true }, false],
    [undefined, false],
  ])(
    'treats MCP annotations %j as read-only: %s',
    async (annotations, readOnly) => {
      const authorize = jest.fn().mockResolvedValue({ allowed: true });
      await wrap(authorize, annotations && { annotations }).execute(
        {},
        { toolCallId: 'c1' },
      );
      expect(authorize).toHaveBeenCalledWith(
        expect.any(String),
        'c1',
        expect.anything(),
        undefined,
        expect.objectContaining({ readOnly }),
        undefined,
      );
    },
  );
});

describe('AgentTool run_tool', () => {
  const connector = {
    name: 'Nmap',
    slug: 'nmap',
    shortDescription: 'Network mapper',
    agentTool: true,
    image: 'nmap:latest',
  };
  type Runnable = {
    execute: (input: unknown, options?: unknown) => Promise<unknown>;
  };

  const createAgentTool = (overrides: Record<string, unknown> = {}) =>
    Object.assign(Object.create(AgentTool.prototype), {
      connectorRegistry: {
        getAgentConnectors: jest.fn(() => [connector]),
        getConnector: jest.fn(() => connector),
        getResourceDefaults: jest.fn(() => ({
          cpu: '500m',
          memory: '512Mi',
          timeoutSeconds: 600,
        })),
      },
      toolsService: {
        getToolByNames: jest.fn().mockResolvedValue([{ id: 't1' }]),
        getToolById: jest
          .fn()
          .mockResolvedValue({ id: 't1', isInstalled: true }),
      },
      remoteExecuteSubscribe: {
        pickConversationWorker: jest
          .fn()
          .mockResolvedValue({ workerId: 'wk-1', pin: false }),
        pinConversationWorker: jest.fn().mockResolvedValue(undefined),
      },
      toolConfigProfiles: {
        resolveConfigForJob: jest.fn().mockResolvedValue({ rate: 10 }),
      },
      redisService: {
        setex: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue(null),
      },
      remoteExecuteService: {
        waitForToolRun: jest.fn().mockResolvedValue({
          stdout: 'raw output',
          exitCode: 0,
          error: null,
          timedOut: false,
        }),
      },
      ...overrides,
    }) as AgentTool;

  const runnable = (agentTool: AgentTool) =>
    agentTool.runToolTool('w1', 'c1') as unknown as Runnable;

  it('is offered in AGENT mode only, and only with a conversation', () => {
    const agentTool = createAgentTool();
    expect(
      agentTool.getTools('w1', AgentMode.AGENT, undefined, 'c1'),
    ).toHaveProperty('run_tool');
    expect(
      agentTool.getTools('w1', AgentMode.ASK, undefined, 'c1'),
    ).not.toHaveProperty('run_tool');
    expect(agentTool.runToolTool('w1', '')).toBeNull();
  });

  it('pushes the tool run to the conversation worker and returns its raw output', async () => {
    const agentTool = createAgentTool();
    const signal = new AbortController().signal;
    const result = await runnable(agentTool).execute(
      { tool: 'nmap', target: 'example.com' },
      { toolCallId: 'call-1', abortSignal: signal },
    );

    const wait = (agentTool as any).remoteExecuteService
      .waitForToolRun as jest.Mock;
    expect(wait).toHaveBeenCalledWith(
      'wk-1',
      {
        tool: 'nmap',
        image: 'nmap:latest',
        target: 'example.com',
        configJson: '{"rate":10}',
        cpu: '500m',
        memory: '512Mi',
        // The manifest's 600s is capped to the 5-minute agent budget.
        timeoutSeconds: 300,
      },
      expect.any(String),
      300_000 + 30_000,
      {
        abortSignal: signal,
        maxOutputChars: 10 * 1024 * 1024,
        onPushed: undefined,
      },
    );
    expect(result).toEqual({
      tool: 'nmap',
      target: 'example.com',
      stdout: 'raw output',
      exitCode: 0,
      error: null,
      timedOut: false,
      truncated: false,
      totalLines: 1,
    });
    expect((agentTool as any).redisService.setex).not.toHaveBeenCalled();
  });

  it('refuses a tool not installed in the workspace', async () => {
    const agentTool = createAgentTool({
      toolsService: {
        getToolByNames: jest.fn().mockResolvedValue([{ id: 't1' }]),
        getToolById: jest
          .fn()
          .mockResolvedValue({ id: 't1', isInstalled: false }),
      },
    });
    await expect(
      runnable(agentTool).execute(
        { tool: 'nmap', target: 'example.com' },
        {
          toolCallId: 'call-1',
        },
      ),
    ).resolves.toEqual({
      error: 'Tool nmap is not installed in this workspace.',
    });
  });

  it('pins a fallback worker once the run is pushed', async () => {
    const agentTool = createAgentTool();
    const subscribe = (agentTool as any).remoteExecuteSubscribe;
    subscribe.pickConversationWorker.mockResolvedValue({
      workerId: 'wk-2',
      pin: true,
    });
    await runnable(agentTool).execute(
      { tool: 'nmap', target: 'example.com' },
      { toolCallId: 'call-1' },
    );

    const wait = (agentTool as any).remoteExecuteService
      .waitForToolRun as jest.Mock;
    const opts = wait.mock.calls[0][4] as { onPushed: () => Promise<void> };
    expect(subscribe.pinConversationWorker).not.toHaveBeenCalled();
    await opts.onPushed();
    expect(subscribe.pinConversationWorker).toHaveBeenCalledWith('c1', 'wk-2');
  });

  it('refuses a tool whose required config is missing', async () => {
    const agentTool = createAgentTool({
      toolConfigProfiles: {
        resolveConfigForJob: jest.fn().mockResolvedValue(undefined),
      },
    });
    (agentTool as any).connectorRegistry.getConnector = jest.fn(() => ({
      ...connector,
      configSchema: { required: ['apiToken'] },
    }));
    const result = (await runnable(agentTool).execute(
      { tool: 'nmap', target: 'example.com' },
      { toolCallId: 'call-1' },
    )) as { error: string };

    expect(result.error).toContain('apiToken');
    expect(
      (agentTool as any).remoteExecuteService.waitForToolRun,
    ).not.toHaveBeenCalled();
  });

  it('counts lines without a phantom line after a trailing newline, and flags the 10MB cut', async () => {
    const agentTool = createAgentTool();
    (agentTool as any).remoteExecuteService.waitForToolRun = jest
      .fn()
      .mockResolvedValue({
        stdout: 'a\nb\n',
        exitCode: 0,
        error: null,
        timedOut: false,
        stdoutTruncated: true,
      });
    const result = (await runnable(agentTool).execute(
      { tool: 'nmap', target: 'example.com' },
      { toolCallId: 'call-1' },
    )) as { totalLines: number; note?: string };

    expect(result.totalLines).toBe(2);
    expect(result.note).toContain('10MB');
  });

  it('keeps a truncated output in Redis and pages it with read_tool_output', async () => {
    const agentTool = createAgentTool();
    const full = Array.from({ length: 3000 }, (_, i) =>
      i === 2500 ? 'admin [Status: 200]' : `path${i} [Status: 404]`,
    ).join('\n');
    (agentTool as any).remoteExecuteService.waitForToolRun = jest
      .fn()
      .mockResolvedValue({
        stdout: full,
        exitCode: 0,
        error: null,
        timedOut: false,
      });
    const result = (await runnable(agentTool).execute(
      { tool: 'nmap', target: 'example.com' },
      { toolCallId: 'call-1' },
    )) as { stdout: string; truncated: boolean; runId: string };

    expect(result.truncated).toBe(true);
    expect(result.stdout).toHaveLength(8 * 1024);
    const setex = (agentTool as any).redisService.setex as jest.Mock;
    expect(setex).toHaveBeenCalledWith(
      `agent:tool-output:c1:${result.runId}`,
      3600,
      full,
    );

    (agentTool as any).redisService.get = jest.fn().mockResolvedValue(full);
    const page = (await (
      agentTool.readToolOutputTool('c1') as unknown as Runnable
    ).execute({ runId: result.runId, pattern: 'status: 200' })) as {
      output: string;
      matchedLines: number;
    };
    expect(page.matchedLines).toBe(1);
    expect(page.output).toBe('2501: admin [Status: 200]\n');
  });

  it('read_tool_output reports an expired run', async () => {
    const agentTool = createAgentTool();
    await expect(
      (agentTool.readToolOutputTool('c1') as unknown as Runnable).execute({
        runId: '00000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toHaveProperty('error');
  });
});

describe('AgentTool display_available_tools', () => {
  type Listing = {
    inputSchema: { parse: (value: unknown) => unknown };
    execute: (input: unknown) => Promise<{ data: unknown[] }>;
  };
  const listTools = (getManyTools: jest.Mock) =>
    (
      Object.assign(Object.create(AgentTool.prototype), {
        toolsService: { getManyTools },
      }) as AgentTool
    ).listToolsTool('w1') as Listing;
  const page = (data: unknown[]) => ({
    data,
    total: data.length,
    page: 1,
    limit: 100,
  });

  it('lists workspace tools with agentTool and readiness', async () => {
    const getManyTools = jest.fn().mockResolvedValue(
      page([
        {
          id: 't1',
          name: 'subfinder',
          type: WorkerType.BUILT_IN,
          category: 'subdomains',
          description: 'Subdomain discovery',
          agentTool: true,
          isInstalled: true,
          isReady: true,
          availableWorkersCount: 2,
        },
        {
          id: 't2',
          name: 'wpscan',
          type: WorkerType.CONNECTOR,
          category: 'vulnerabilities',
          description: 'WordPress scanner',
          agentTool: false,
          isInstalled: false,
          availableWorkersCount: 0,
        },
      ]),
    );

    const result = await listTools(getManyTools).execute({ q: 'scan' });

    expect(getManyTools).toHaveBeenCalledWith(
      expect.objectContaining({
        agentTool: undefined,
        workspaceId: 'w1',
        search: 'scan',
      }),
    );
    expect(result.data).toEqual([
      {
        id: 't1',
        name: 'subfinder',
        type: WorkerType.BUILT_IN,
        category: 'subdomains',
        description: 'Subdomain discovery',
        agentTool: true,
        isInstalled: true,
        isReady: true,
      },
      {
        id: 't2',
        name: 'wpscan',
        type: WorkerType.CONNECTOR,
        category: 'vulnerabilities',
        description: 'WordPress scanner',
        agentTool: false,
        isInstalled: false,
        isReady: false,
      },
    ]);
  });

  it.each([true, false])(
    'passes agentTool=%s through as the filter',
    async (agentTool) => {
      const getManyTools = jest.fn().mockResolvedValue(page([]));

      await listTools(getManyTools).execute({ agentTool });

      expect(getManyTools).toHaveBeenCalledWith(
        expect.objectContaining({ agentTool, workspaceId: 'w1' }),
      );
    },
  );

  it('accepts a boolean agentTool in its input schema', () => {
    const { inputSchema } = listTools(jest.fn());
    expect(inputSchema.parse({ agentTool: true })).toMatchObject({
      agentTool: true,
    });
    expect(() => inputSchema.parse({ agentTool: 'yes' })).toThrow();
  });
});

describe('pageToolOutput', () => {
  const raw = ['a', 'b', 'c', 'd', 'e'].join('\n');

  it('pages by line with nextOffset', () => {
    expect(pageToolOutput(raw, { offset: 1, limit: 2 })).toEqual({
      totalLines: 5,
      offset: 1,
      nextOffset: 3,
      output: '2: b\n3: c\n',
    });
    expect(pageToolOutput(raw, { offset: 3, limit: 10 }).nextOffset).toBeNull();
  });

  it('does not count a trailing newline as a line', () => {
    expect(pageToolOutput(`${raw}\n`, { offset: 0, limit: 10 })).toMatchObject({
      totalLines: 5,
      nextOffset: null,
    });
  });

  it('cuts an oversized line but still advances', () => {
    const page = pageToolOutput('x'.repeat(20_000) + '\nnext', {
      offset: 0,
      limit: 10,
    });
    expect(page.output.length).toBeLessThanOrEqual(8 * 1024);
    expect(page.output).toContain('[line cut]');
    expect(page.nextOffset).toBe(1);
  });
});
