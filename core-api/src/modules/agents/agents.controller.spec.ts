import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { HttpStatus, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgentApprovalsController } from './agent-approvals.controller';
import { AgentHttpRequestsController } from './agent-http-requests.controller';
import { AgentCustomizationController } from './agent-customization.controller';
import { AgentMcpConfigsController } from './agent-mcp-configs.controller';
import { AgentModelsController } from './agent-models.controller';
import { AgentSettingsController } from './agent-settings.controller';
import { AgentsController } from './agents.controller';

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

/** The agents routes, split by resource over these controllers. */
const AGENT_CONTROLLERS = [
  AgentsController,
  AgentApprovalsController,
  AgentModelsController,
  AgentMcpConfigsController,
  AgentSettingsController,
  AgentCustomizationController,
  AgentHttpRequestsController,
];

/** The handler and the controller that declares it. */
const handlerOf = (method: string): [() => unknown, object] => {
  const owner = AGENT_CONTROLLERS.find((c) =>
    Object.prototype.hasOwnProperty.call(c.prototype, method),
  );
  if (!owner) throw new Error(`no agents controller declares ${method}`);
  return [
    (owner.prototype as unknown as Record<string, () => unknown>)[method],
    owner,
  ];
};

describe('Agents controllers workspace permission guards', () => {
  const reflector = new Reflector();

  const read: Array<[string, string]> = [
    ['getAgentModes', 'GET /modes'],
    ['getProviders', 'GET /providers'],
    ['getConnectedProviders', 'GET /providers/connected'],
    ['getProviderModels', 'GET /llm-configs/:id/models'],
    ['getConversation', 'GET /conversations/:id'],
    ['getConversationSubagents', 'GET /conversations/:id/subagents'],
    [
      'getConversationSubagent',
      'GET /conversations/:id/subagents/:subagentId',
    ],
    ['getConversations', 'GET /conversations'],
    ['getUsage', 'GET /usage'],
    ['getMessages', 'GET /conversations/:id/messages'],
    ['resumeStream', 'GET /conversations/:id/stream'],
    ['getMCPConfig', 'GET /mcp-configs'],
    ['pingMCPServer', 'GET /mcp-configs/:name/ping'],
    ['getWorkspaceMemory', 'GET /workspace-memory'],
    ['getSkills', 'GET /skills'],
    ['getAgentConfig', 'GET /config'],
    ['getAgentDefinitions', 'GET /definitions'],
    ['getHttpRequests', 'GET /http-requests'],
    ['getHttpRequest', 'GET /http-requests/:id'],
  ];

  const write: Array<[string, string]> = [
    ['createLLMConfig', 'POST /llm-configs'],
    ['updateLLMConfig', 'PATCH /llm-configs/:id'],
    ['deleteLLMConfig', 'DELETE /llm-configs/:id'],
    ['setPreferredLLMConfig', 'PATCH /llm-configs/:id/set-preferred'],
    ['updateConversation', 'PATCH /conversations/:id'],
    ['deleteAllConversations', 'DELETE /conversations'],
    ['deleteConversation', 'DELETE /conversations/:id'],
    ['deleteMessage', 'DELETE /conversations/:cid/messages/:mid'],
    ['upsertMCPServer', 'PUT /mcp-configs/:name'],
    ['deleteMCPServer', 'DELETE /mcp-configs/:name'],
    ['toggleMCPServer', 'PATCH /mcp-configs/:name/toggle'],
    ['deleteWorkspaceMemory', 'DELETE /workspace-memory/:id'],
    ['stopConversation', 'POST /conversations/:id/stop'],
    ['createAgentDefinition', 'POST /definitions'],
    ['updateAgentDefinition', 'PATCH /definitions/:id'],
    ['deleteAgentDefinition', 'DELETE /definitions/:id'],
    ['createSkill', 'POST /skills'],
    ['updateSkill', 'PATCH /skills/:id'],
    ['deleteSkill', 'DELETE /skills/:id'],
    ['toggleSkill', 'PATCH /skills/:id/toggle'],
    ['decideCommandApproval', 'PATCH /command-approvals/:id'],
    ['revokeCommandApproval', 'DELETE /command-approvals/:id'],
    ['decidePlanApproval', 'PATCH /plan-approvals/:id'],
    ['upsertAgentConfig', 'PUT /config'],
  ];

  it.each(read)('%s (%s) requires agent.read', (method, _route) => {
    const required = reflector.getAllAndOverride(WorkspacePermissions, handlerOf(method));
    expect(required).toEqual(['agent.read']);
  });

  it.each(write)('%s (%s) requires agent.write', (method, _route) => {
    const required = reflector.getAllAndOverride(WorkspacePermissions, handlerOf(method));
    expect(required).toEqual(['agent.write']);
  });

  const execute: Array<[string, string]> = [
    ['streamMessage', 'POST /messages/stream'],
  ];

  it.each(execute)('%s (%s) requires agent.read', (method, _route) => {
    const required = reflector.getAllAndOverride(WorkspacePermissions, handlerOf(method));
    expect(required).toEqual(['agent.read']);
  });
});

describe('AgentsController.resumeStream', () => {
  function setup(getConversation: jest.Mock) {
    const createResumeStream = jest.fn();
    const controller = Object.assign(
      Object.create(AgentsController.prototype) as AgentsController,
      {
        agentsService: { getConversation },
        agentsStreamBuffer: { createResumeStream },
        activeRuns: { isActive: jest.fn() },
      },
    );
    const end = jest.fn();
    const res = { status: jest.fn(() => ({ end })) };
    return { controller, createResumeStream, res, end };
  }

  it('answers 204 for a conversation that is not saved yet', async () => {
    // A chat started on the client has no row until its first message is
    // saved; a 404 here would surface as a stream error in the chat.
    const { controller, createResumeStream, res, end } = setup(
      jest.fn().mockRejectedValue(new NotFoundException()),
    );

    await controller.resumeStream('c1', 'w1', 'u1', res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
    expect(end).toHaveBeenCalled();
    expect(createResumeStream).not.toHaveBeenCalled();
  });

  it('rethrows other errors from the ownership check', async () => {
    const { controller, res } = setup(
      jest.fn().mockRejectedValue(new Error('db down')),
    );

    await expect(
      controller.resumeStream('c1', 'w1', 'u1', res as never),
    ).rejects.toThrow('db down');
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('AgentsController.streamMessage live-only parts', () => {
  it('publishes screenshots and HTTP request pushes live, buffers the rest', async () => {
    const chunks = [
      { type: 'text-delta', delta: 'hi' },
      { type: 'data-browser-screenshot', data: {}, transient: true },
      { type: 'data-http-requests-updated', data: { requests: [] }, transient: true },
    ];
    const append = jest.fn(() => Promise.resolve());
    const publishLive = jest.fn(() => Promise.resolve());
    const controller = Object.assign(
      Object.create(AgentsController.prototype) as AgentsController,
      {
        agentsCompletionsService: {
          streamMessage: jest.fn().mockResolvedValue({
            conversationId: 'c1',
            settled: Promise.resolve(),
            stream: new ReadableStream({
              start: (c) => {
                chunks.forEach((chunk) => c.enqueue(chunk));
                c.close();
              },
            }),
          }),
        },
        agentsStreamBuffer: {
          reset: jest.fn(() => Promise.resolve()),
          append,
          publishLive,
          finish: jest.fn(() => Promise.resolve()),
        },
        activeRuns: { register: jest.fn(), clear: jest.fn() },
      },
    );
    const res = {
      on: jest.fn(),
      off: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      writableEnded: false,
    };

    await controller.streamMessage({}, 'w1', 'u1', res);

    const types = (calls: unknown[][]) =>
      calls.map(([, json]) => (JSON.parse(json as string) as { type: string }).type);
    expect(types(publishLive.mock.calls)).toEqual([
      'data-browser-screenshot',
      'data-http-requests-updated',
    ]);
    expect(types(append.mock.calls)).toEqual(['text-delta']);
  });
});

describe('AgentsController.getConversations', () => {
  it('marks conversations whose run is live here or streams elsewhere', async () => {
    const isRunActive = jest.fn((id: string) => id === 'local');
    const isStreaming = jest.fn((id: string) =>
      Promise.resolve(id === 'remote'),
    );
    const controller = Object.assign(
      Object.create(AgentsController.prototype) as AgentsController,
      {
        agentsService: {
          getConversations: jest.fn().mockResolvedValue({
            data: [{ id: 'local' }, { id: 'remote' }, { id: 'idle' }],
            total: 3,
          }),
        },
        agentsStreamBuffer: { isStreaming },
        activeRuns: { isActive: isRunActive },
      },
    );

    const result = (await controller.getConversations({}, 'w1', 'u1')) as {
      data: { id: string; running: boolean }[];
      total: number;
    };

    expect(result.data.map((c) => [c.id, c.running])).toEqual([
      ['local', true],
      ['remote', true],
      ['idle', false],
    ]);
    expect(result.total).toBe(3);
  });
});
