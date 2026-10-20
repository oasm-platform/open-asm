import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { HttpStatus, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgentsController } from './agents.controller';

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

describe('AgentsController workspace permission guards', () => {
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
    ['getMessages', 'GET /conversations/:id/messages'],
    ['resumeStream', 'GET /conversations/:id/stream'],
    ['getMCPConfig', 'GET /mcp-configs'],
    ['pingMCPServer', 'GET /mcp-configs/:name/ping'],
    ['getWorkspaceMemory', 'GET /workspace-memory'],
    ['getSkills', 'GET /skills'],
    ['getAgentConfig', 'GET /config'],
    ['getAgentDefinitions', 'GET /definitions'],
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
    const handler = (AgentsController.prototype as unknown as Record<string, () => unknown>)[
      method
    ];
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      AgentsController,
    ]);
    expect(required).toEqual(['agent.read']);
  });

  it.each(write)('%s (%s) requires agent.write', (method, _route) => {
    const handler = (AgentsController.prototype as unknown as Record<string, () => unknown>)[
      method
    ];
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      AgentsController,
    ]);
    expect(required).toEqual(['agent.write']);
  });

  const execute: Array<[string, string]> = [
    ['streamMessage', 'POST /messages/stream'],
  ];

  it.each(execute)('%s (%s) requires agent.read', (method, _route) => {
    const handler = (AgentsController.prototype as unknown as Record<string, () => unknown>)[
      method
    ];
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      AgentsController,
    ]);
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
        agentsCompletionsService: { isRunActive: jest.fn() },
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
