import { AgentApprovalMode } from '@/common/enums/enum';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'node:events';
import { AgentsMcpService, getMcpToolMetadata } from './agents.mcp';
import type { AgentsService } from './agents.service';
import { AgentTool, stableStringify } from './agents.tools';

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

    await expect(wrapped.partner_scan.execute(input, options)).resolves.toEqual({
      ok: true,
    });
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
    execute: (params: unknown, options: { toolCallId: string }) => Promise<unknown>;
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
  ])('treats MCP annotations %j as read-only: %s', async (annotations, readOnly) => {
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
  });
});
