import type { AgentTool } from '@/modules/agents/agents.tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tool } from 'ai';
import { z } from 'zod';
import { McpService } from './mcp.service';

describe('McpService', () => {
  it('publishes AI SDK input schemas and rejects invalid tool arguments', async () => {
    const execute = jest.fn(({ target }: { target: string }) =>
      Promise.resolve({ target }),
    );
    const agentTool = {
      getTools: jest.fn().mockReturnValue({
        scan_target: tool({
          description: 'Scan one target',
          inputSchema: z.object({ target: z.string() }),
          execute,
        }),
      }),
    } as unknown as AgentTool;
    const service = new McpService(agentTool);
    const server = (
      service as unknown as {
        createMcpServer(workspaceId: string): McpServer;
      }
    ).createMcpServer('workspace-1');
    const client = new Client({ name: 'mcp-service-test', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const { tools } = await client.listTools();
      const registeredTool = tools.find(({ name }) => name === 'scan_target');

      expect(registeredTool?.inputSchema).toMatchObject({
        type: 'object',
        properties: { target: { type: 'string' } },
        required: ['target'],
      });

      const invalidResult = await client.callTool({
        name: 'scan_target',
        arguments: { target: 42 },
      });

      expect(invalidResult).toMatchObject({
        isError: true,
        content: [
          expect.objectContaining({
            text: expect.stringContaining('Input validation error'),
          }),
        ],
      });
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
