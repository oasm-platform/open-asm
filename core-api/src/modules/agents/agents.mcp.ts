import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { AgentsService } from './agents.service';
import { MCPServerResponseDto } from './dto/mcp-config.dto';

@Injectable()
export class AgentsMcpService {
  private readonly logger = new Logger(AgentsMcpService.name);

  constructor(private readonly agentsService: AgentsService) {}

  async getTools(workspaceId: string): Promise<Record<string, unknown>> {
    const mcpConfig = await this.agentsService.getMCPConfig(workspaceId);
    const enabledServers = mcpConfig.servers.filter((s) => !s.disabled);

    const allTools: Record<string, unknown> = {};

    for (const server of enabledServers) {
      try {
        const serverTools = await this.fetchToolsFromServer(server);
        Object.assign(allTools, serverTools);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to fetch tools from MCP server "${server.name}": ${message}`,
        );
      }
    }

    return allTools;
  }

  private async fetchToolsFromServer(
    server: MCPServerResponseDto,
  ): Promise<Record<string, unknown>> {
    const client = new Client(
      {
        name: 'OASM-Security-Agent',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    let transport;
    if (server.url) {
      transport = new SSEClientTransport(new URL(server.url));
    } else if (server.command) {
      transport = new StdioClientTransport({
        command: server.command,
        args: server.args || [],
        env: {
          ...process.env,
          ...(server.env || {}),
        } as Record<string, string>,
      });
    } else {
      return {};
    }

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();

      const mcpTools: Record<string, unknown> = {};

      for (const t of tools) {
        // Prefix tool name with server name to avoid collisions
        const toolName = `${server.name}_${t.name}`;

        mcpTools[toolName] = {
          description:
            t.description || `MCP tool ${t.name} from ${server.name}`,
          parameters: t.inputSchema,
          execute: async (params: unknown) => {
            return this.callMcpTool(server, t.name, params);
          },
        };
      }

      return mcpTools;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`MCP connection error for ${server.name}: ${message}`);
      return {};
    } finally {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  private async callMcpTool(
    server: MCPServerResponseDto,
    toolName: string,
    args: unknown,
  ): Promise<unknown> {
    const client = new Client(
      {
        name: 'OASM-Security-Agent',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    let transport;
    if (server.url) {
      transport = new SSEClientTransport(new URL(server.url));
    } else if (server.command) {
      transport = new StdioClientTransport({
        command: server.command,
        args: server.args || [],
        env: {
          ...process.env,
          ...(server.env || {}),
        } as Record<string, string>,
      });
    } else {
      throw new Error(`Invalid MCP server configuration for ${server.name}`);
    }

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: toolName,
        arguments: args as Record<string, unknown>,
      });
      return result;
    } finally {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
