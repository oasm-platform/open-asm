import { WorkerType } from '@/common/enums/enum';
import { AgentApprovalMode, AgentMode } from '@/modules/agents/enums/agent.enums';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'node:events';
import { withoutDisabledTools } from './agents.config';
import { AgentsMcpService, getMcpToolMetadata } from './agents.mcp';
import type { AgentsService } from './agents.service';
import { AgentTool, MCP_TOOLS, READ_ONLY_TOOLS } from './agents.tools';
import { agentFunctionWith, agentToolWith } from './agents.tools.testing';
import { ConnectorTools, pageToolOutput } from './tools/connector.tools';
import { _resetValidatorCache } from '@/modules/tools/validators/tool-config-profiles.validator';
import { stableStringify } from './tools/helpers';
import { WorkspaceTools } from './tools/workspace.tools';

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
      guard: { evaluate: jest.fn().mockResolvedValue({ action: 'default' }) },
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
        guard: { evaluate: jest.fn().mockResolvedValue({ action: 'default' }) },
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

describe('AgentTool run_tool_connector', () => {
  const connector = {
    name: 'Nmap',
    slug: 'nmap',
    shortDescription: 'Network mapper',
    agentTool: true,
    image: 'nmap:latest',
    egress: 'direct' as const,
  };
  type Runnable = {
    execute: (input: unknown, options?: unknown) => Promise<unknown>;
  };

  const createAgentTool = (overrides: Record<string, unknown> = {}) =>
    agentToolWith({
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
      // The run's member holds every permission (TOOL_PERMISSIONS has its own spec)
      workspacesService: {
        getMembershipWithPermissions: jest
          .fn()
          .mockResolvedValue({ permissionKeys: ['*'] }),
      },
      ...overrides,
    });

  const runnable = (agentTool: AgentTool) =>
    agentTool.getTools('w1', 'u1', AgentMode.AGENT, undefined, 'c1')
      .run_tool_connector as Runnable;
  const readOutput = (agentTool: AgentTool) =>
    agentTool.getTools('w1', 'u1', AgentMode.AGENT, undefined, 'c1')
      .read_tool_output as Runnable;

  it('is offered in AGENT mode only, and only with a conversation', () => {
    const agentTool = createAgentTool();
    expect(
      agentTool.getTools('w1', 'u1', AgentMode.AGENT, undefined, 'c1'),
    ).toHaveProperty('run_tool_connector');
    expect(
      agentTool.getTools('w1', 'u1', AgentMode.ASK, undefined, 'c1'),
    ).not.toHaveProperty('run_tool_connector');
    expect(agentTool.getTools('w1', 'u1', AgentMode.AGENT)).not.toHaveProperty(
      'run_tool_connector',
    );
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
        directEgress: true,
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
      runId: expect.any(String),
    });
    // Kept even when short, so propose_vulnerability can check quotes from it
    expect((agentTool as any).redisService.setex).toHaveBeenCalledWith(
      `agent:tool-output:c1:${(result as { runId: string }).runId}`,
      3600,
      'raw output',
    );
  });

  describe('inline nuclei templates', () => {
    const nuclei = { ...connector, name: 'Nuclei', slug: 'nuclei', image: 'nuclei:3' };
    const createNucleiTool = () => {
      const agentTool = createAgentTool();
      const registry = (agentTool as any).connectorRegistry;
      registry.getAgentConnectors.mockReturnValue([nuclei]);
      registry.getConnector.mockReturnValue(nuclei);
      return agentTool;
    };

    it('ships the templates in the run config without saving them', async () => {
      const agentTool = createNucleiTool();
      await runnable(agentTool).execute(
        { tool: 'nuclei', target: 'example.com', templates: ['id: probe\n'] },
        { toolCallId: 'call-1' },
      );

      const run = ((agentTool as any).remoteExecuteService.waitForToolRun as jest.Mock)
        .mock.calls[0][1] as { configJson: string };
      expect(JSON.parse(run.configJson)).toEqual({
        rate: 10,
        customTemplates: [{ content: 'id: probe\n' }],
      });
    });

    it('reports an invalid template to the model instead of running', async () => {
      const agentTool = createNucleiTool();
      const result = await runnable(agentTool).execute(
        { tool: 'nuclei', target: 'example.com', templates: ['info: {}\n'] },
        { toolCallId: 'call-1' },
      );

      expect(result).toEqual({
        error: 'templates[0]: Template must be a YAML mapping with a string "id"',
      });
      expect((agentTool as any).remoteExecuteService.waitForToolRun).not.toHaveBeenCalled();
    });

    it('refuses templates for any other tool', async () => {
      const agentTool = createAgentTool();
      await expect(
        runnable(agentTool).execute(
          { tool: 'nmap', target: 'example.com', templates: ['id: a\n'] },
          { toolCallId: 'call-1' },
        ),
      ).resolves.toEqual({ error: 'templates only apply to the nuclei tool.' });
    });
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

  describe('inline config', () => {
    const schema = {
      type: 'object',
      properties: {
        ports: { type: 'string', description: 'Ports to scan.' },
        retries: { type: 'integer', minimum: 0 },
        apiKey: { type: 'string', 'ui:widget': 'password' },
      },
    };
    const withSchema = () => {
      const agentTool = createAgentTool();
      (agentTool as any).connectorRegistry.getConnector = jest.fn(() => ({
        ...connector,
        configSchema: schema,
      }));
      return agentTool;
    };
    beforeEach(() => _resetValidatorCache());

    it('merges it over the profile for this run', async () => {
      const agentTool = withSchema();

      await runnable(agentTool).execute(
        { tool: 'nmap', target: 'example.com', config: { ports: '22,443' } },
        { toolCallId: 'call-1' },
      );

      expect(
        (agentTool as any).toolConfigProfiles.resolveConfigForJob,
      ).toHaveBeenCalledWith('w1', 't1', {
        configProfileId: undefined,
        config: { ports: '22,443' },
      });
      expect(
        (agentTool as any).remoteExecuteService.waitForToolRun,
      ).toHaveBeenCalled();
    });

    it.each([
      ['a secret field', { apiKey: 'k' }, 'apiKey'],
      ['an unknown field', { colour: 'red' }, 'colour'],
      ['a value of the wrong type', { retries: 'many' }, 'retries'],
    ])('refuses %s before running', async (_case, config, mention) => {
      const agentTool = withSchema();

      const result = (await runnable(agentTool).execute(
        { tool: 'nmap', target: 'example.com', config },
        { toolCallId: 'call-1' },
      )) as { error: string };

      expect(result.error).toContain(mention);
      expect(
        (agentTool as any).remoteExecuteService.waitForToolRun,
      ).not.toHaveBeenCalled();
    });
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
    const page = (await readOutput(agentTool).execute({
      runId: result.runId,
      pattern: 'status: 200',
    })) as {
      output: string;
      matchedLines: number;
    };
    expect(page.matchedLines).toBe(1);
    expect(page.output).toBe('2501: admin [Status: 200]\n');
  });

  it('read_tool_output keeps only the requested fields of JSON lines', async () => {
    const agentTool = createAgentTool();
    const finding = (name: string) =>
      JSON.stringify([
        { name, severity: 'high', description: 'x'.repeat(2000) },
      ]);
    const full = [finding('A'), 'not json', finding('B')].join('\n');
    (agentTool as any).redisService.get = jest.fn().mockResolvedValue(full);

    const page = (await readOutput(agentTool).execute({
      runId: '00000000-0000-4000-8000-000000000001',
      fields: ['name', 'severity'],
    })) as { output: string; nextOffset: number | null };

    expect(page.nextOffset).toBeNull();
    expect(page.output).toBe(
      '1: [{"name":"A","severity":"high"}]\n' +
        '2: not json\n' +
        '3: [{"name":"B","severity":"high"}]\n',
    );
  });

  it('read_tool_output reports an expired run', async () => {
    const agentTool = createAgentTool();
    await expect(
      readOutput(agentTool).execute({
        runId: '00000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toHaveProperty('error');
  });
});

describe('AgentTool display_available_tools', () => {
  type Listing = {
    inputSchema: { parse: (value: unknown) => unknown };
    execute: (input: unknown) => Promise<unknown[]>;
  };
  const acunetixSchema = {
    type: 'object',
    required: ['url', 'apiKey'],
    properties: {
      url: {
        type: 'string',
        title: 'Acunetix URL',
        description: 'Base URL of the Acunetix instance.',
        'ui:placeholder': 'https://acunetix.local:3443',
      },
      apiKey: {
        type: 'string',
        title: 'API key',
        'ui:widget': 'password',
      },
      criticality: {
        type: 'integer',
        description: 'Target business criticality.',
        enum: [30, 20, 10, 0],
        default: 10,
      },
    },
  };
  const getConnectorSchema = jest.fn((slug: string) =>
    slug === 'acunetix' ? acunetixSchema : null,
  );
  const listTools = (getAgentTools: jest.Mock) =>
    agentFunctionWith(WorkspaceTools, 'display_available_tools', {
      toolsService: { getAgentTools },
      connectorRegistry: { getConnectorSchema },
    }) as unknown as Listing;

  it("lists the workspace's agent tools with their config fields, not a readiness flag", async () => {
    const getAgentTools = jest.fn().mockResolvedValue([
      {
        id: 't1',
        name: 'subfinder',
        type: WorkerType.BUILT_IN,
        categories: [{ name: 'subdomains', targetTypes: [] }],
        description: 'Subdomain discovery',
        agentTool: true,
        isInstalled: true,
        isReady: true,
      },
      {
        id: 't2',
        name: 'acunetix',
        type: WorkerType.CONNECTOR,
        categories: [{ name: 'vulnerabilities', targetTypes: [] }],
        description: 'Web scanner',
        agentTool: true,
        isInstalled: true,
        hasConfigProfile: false,
        isReady: false,
      },
    ]);

    const result = await listTools(getAgentTools).execute({ q: 'scan' });

    expect(getAgentTools).toHaveBeenCalledWith('w1', 'scan');
    expect(result).toEqual([
      {
        id: 't1',
        name: 'subfinder',
        type: WorkerType.BUILT_IN,
        categories: ['subdomains'],
        description: 'Subdomain discovery',
      },
      {
        id: 't2',
        name: 'acunetix',
        type: WorkerType.CONNECTOR,
        categories: ['vulnerabilities'],
        description: 'Web scanner',
        config: [
          {
            name: 'url',
            type: 'string',
            required: true,
            description: 'Base URL of the Acunetix instance.',
          },
          {
            name: 'apiKey',
            type: 'string',
            required: true,
            description: 'API key',
            secret: true,
          },
          {
            name: 'criticality',
            type: 'integer',
            required: false,
            description: 'Target business criticality.',
            enum: [30, 20, 10, 0],
            default: 10,
          },
        ],
      },
    ]);
  });

  it('omits config for a connector without a config schema', async () => {
    const getAgentTools = jest.fn().mockResolvedValue([
      {
        id: 't3',
        name: 'httpx',
        type: WorkerType.CONNECTOR,
        categories: [],
        description: 'HTTP probe',
        isReady: true,
      },
    ]);

    const [item] = await listTools(getAgentTools).execute({});

    expect(item).not.toHaveProperty('config');
  });

  it('ignores stale agentTool and paging params', async () => {
    const getAgentTools = jest.fn().mockResolvedValue([]);
    const listing = listTools(getAgentTools);

    await listing.execute(
      listing.inputSchema.parse({ agentTool: true, page: 2, limit: 5 }),
    );

    expect(getAgentTools).toHaveBeenCalledWith('w1', undefined);
  });
});

describe('AgentTool list_tool_config_profiles', () => {
  type Listing = {
    execute: (input: unknown) => Promise<Record<string, unknown>>;
  };
  const schema = {
    type: 'object',
    required: ['url', 'apiKey'],
    properties: {
      url: { type: 'string' },
      apiKey: { type: 'string', 'ui:widget': 'password' },
      criticality: { type: 'integer' },
    },
  };

  function build(installed: boolean) {
    const deps = {
      toolsService: {
        getToolByNames: jest
          .fn()
          .mockResolvedValue([{ id: 't2', name: 'acunetix' }]),
        getToolById: jest.fn().mockResolvedValue({
          id: 't2',
          name: 'acunetix',
          type: WorkerType.CONNECTOR,
          isInstalled: installed,
        }),
      },
      toolConfigProfiles: {
        list: jest.fn().mockResolvedValue([
          {
            id: 'p1',
            name: 'prod',
            isDefault: true,
            config: { url: 'https://acu.local', apiKey: '****abcd', criticality: '' },
          },
          {
            id: 'p2',
            name: 'draft',
            isDefault: false,
            config: { url: 'https://acu2.local' },
          },
        ]),
      },
      connectorRegistry: { getConnectorSchema: jest.fn(() => schema) },
    };
    const tool = agentFunctionWith(
      ConnectorTools,
      'list_tool_config_profiles',
      deps,
    ) as unknown as Listing;
    return { deps, tool };
  }

  it('lists the profiles with the fields they set, never their values', async () => {
    const { deps, tool } = build(true);

    const result = await tool.execute({ tool: 'acunetix' });

    expect(deps.toolsService.getToolById).toHaveBeenCalledWith('t2', 'w1');
    expect(deps.toolConfigProfiles.list).toHaveBeenCalledWith('w1', 't2');
    expect(result).toEqual({
      tool: 'acunetix',
      profiles: [
        {
          id: 'p1',
          name: 'prod',
          isDefault: true,
          configuredFields: ['url', 'apiKey'],
          missingRequired: [],
        },
        {
          id: 'p2',
          name: 'draft',
          isDefault: false,
          configuredFields: ['url'],
          missingRequired: ['apiKey'],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('acu.local');
    expect(JSON.stringify(result)).not.toContain('abcd');
  });

  it('refuses a connector that is not installed in the workspace', async () => {
    const { deps, tool } = build(false);

    const result = await tool.execute({ tool: 'acunetix' });

    expect(result).toHaveProperty('error');
    expect(deps.toolConfigProfiles.list).not.toHaveBeenCalled();
  });

  it('is read-only and stays off the MCP surface', () => {
    expect(READ_ONLY_TOOLS.has('list_tool_config_profiles')).toBe(true);
    expect(MCP_TOOLS.has('list_tool_config_profiles')).toBe(false);
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

describe('AgentTool MCP surface', () => {
  const agentTool = agentToolWith();

  it('offers only the read-only workspace data tools', () => {
    const names = Object.keys(agentTool.getMcpTools('w1'));
    expect(names.sort()).toEqual([...MCP_TOOLS].sort());
    expect(names.every((name) => READ_ONLY_TOOLS.has(name))).toBe(true);
  });

  it.each([
    'execute_remote_command',
    'run_tool_connector',
    'read_tool_output',
    'retrieve_web_page',
    'display_available_tools',
    'list_tool_config_profiles',
    'inspect_pipeline_tool',
  ])('never offers %s', (name) => {
    expect(agentTool.getMcpTools('w1')).not.toHaveProperty(name);
  });
});

describe('renamed tools', () => {
  it('still honours run_tool in saved disabled tools', () => {
    const tools = { run_tool_connector: {}, enumerate_assets: {} };
    expect(
      Object.keys(
        withoutDisabledTools(tools, { disabledTools: ['run_tool'] } as never),
      ),
    ).toEqual(['enumerate_assets']);
  });
});
