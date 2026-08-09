import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
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
    ['getConversations', 'GET /conversations'],
    ['getMessages', 'GET /conversations/:id/messages'],
    ['getMCPConfig', 'GET /mcp-configs'],
    ['pingMCPServer', 'GET /mcp-configs/:name/ping'],
    ['getWorkspaceMemory', 'GET /workspace-memory'],
    ['getSkills', 'GET /skills'],
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
    ['createSkill', 'POST /skills'],
    ['updateSkill', 'PATCH /skills/:id'],
    ['deleteSkill', 'DELETE /skills/:id'],
    ['toggleSkill', 'PATCH /skills/:id/toggle'],
  ];

  it.each(read)('%s (%s) requires agent.read', (method, _route) => {
    const handler = (AgentsController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      AgentsController,
    ]);
    expect(required).toEqual(['agent.read']);
  });

  it.each(write)('%s (%s) requires agent.write', (method, _route) => {
    const handler = (AgentsController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      AgentsController,
    ]);
    expect(required).toEqual(['agent.write']);
  });

  const execute: Array<[string, string]> = [
    ['streamMessage', 'POST /messages/stream'],
  ];

  it.each(execute)('%s (%s) requires ai.execute', (method, _route) => {
    const handler = (AgentsController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      AgentsController,
    ]);
    expect(required).toEqual(['ai.execute']);
  });
});
