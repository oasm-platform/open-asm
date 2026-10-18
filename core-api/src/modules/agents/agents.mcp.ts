import { Injectable, Logger } from '@nestjs/common';
import { jsonSchema, tool } from 'ai';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { AgentsService } from './agents.service';
import { MCPServerResponseDto } from './dto/mcp-config.dto';

export function getMcpToolMetadata(serverName: string, mcpTool: McpTool) {
  const title = mcpTool.title ?? mcpTool.annotations?.title;

  return {
    source: 'mcp' as const,
    server: serverName,
    name: mcpTool.name,
    ...(title ? { title } : {}),
    ...(mcpTool.annotations ? { annotations: mcpTool.annotations } : {}),
  };
}

/** How long one server may take to connect and list its tools */
const MCP_LIST_TIMEOUT_MS = 5_000;
/** A server's tool list is reused this long before it is listed again */
const MCP_TOOLS_TTL_MS = 5 * 60_000;
/** A server that failed is not retried before this, so it can't slow every message */
const MCP_FAILURE_TTL_MS = 30_000;

/** Rejects when `promise` takes longer than `ms` */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class AgentsMcpService {
  private readonly logger = new Logger(AgentsMcpService.name);

  /**
   * Tool lists by workspace and server config: a changed config (URL,
   * headers, allowed tools) gets a new key, so it is never served stale.
   */
  private readonly toolsCache = new Map<
    string,
    { tools: Record<string, unknown>; expiresAt: number }
  >();

  constructor(private readonly agentsService: AgentsService) {}

  async getTools(workspaceId: string): Promise<Record<string, unknown>> {
    const mcpConfig = await this.agentsService.getMCPConfig(workspaceId);
    const enabledServers = mcpConfig.servers.filter((s) => !s.disabled);

    // Servers are listed concurrently: one slow server no longer adds its
    // delay to every other one
    const serverTools = await Promise.all(
      enabledServers.map((server) => this.getServerTools(workspaceId, server)),
    );
    return Object.assign({}, ...serverTools) as Record<string, unknown>;
  }

  /** One server's tools, from the cache or listed with a timeout */
  private async getServerTools(
    workspaceId: string,
    server: MCPServerResponseDto,
  ): Promise<Record<string, unknown>> {
    const now = Date.now();
    const key = `${workspaceId}:${createHash('sha256').update(JSON.stringify(server)).digest('hex')}`;
    const cached = this.toolsCache.get(key);
    if (cached && cached.expiresAt > now) return cached.tools;

    let tools: Record<string, unknown> = {};
    let ttl = MCP_TOOLS_TTL_MS;
    try {
      tools = await this.fetchToolsFromServer(server);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to fetch tools from MCP server "${server.name}": ${message}`,
      );
      ttl = MCP_FAILURE_TTL_MS;
    }

    for (const [k, entry] of this.toolsCache) {
      if (entry.expiresAt <= now) this.toolsCache.delete(k);
    }
    this.toolsCache.set(key, { tools, expiresAt: now + ttl });
    return tools;
  }

  private createTransport(server: MCPServerResponseDto) {
    if (!server.url) {
      return null;
    }

    const url = new URL(server.url);
    const headers = server.headers ?? {};

    if (server.transport === 'streamable-http') {
      return new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers,
        },
      });
    }

    return new SSEClientTransport(url, {
      requestInit: {
        headers,
      },
    });
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

    const transport = this.createTransport(server);
    if (!transport) {
      return {};
    }

    try {
      const { tools } = await withTimeout(
        client.connect(transport).then(() => client.listTools()),
        MCP_LIST_TIMEOUT_MS,
      );

      const mcpTools: Record<string, unknown> = {};
      const allowedTools = server.allowed_tools
        ? new Set(server.allowed_tools)
        : null;

      for (const t of tools) {
        if (allowedTools && !allowedTools.has(t.name)) continue;

        // Prefix tool name with server name to avoid collisions
        const toolName = `${server.name}_${t.name}`;
        const title = t.title ?? t.annotations?.title;

        mcpTools[toolName] = tool({
          ...(title ? { title } : {}),
          description: t.description,
          metadata: getMcpToolMetadata(server.name, t),
          inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
          execute: async (
            params: unknown,
            options: { abortSignal?: AbortSignal },
          ) => {
            return this.callMcpTool(
              server,
              t.name,
              params,
              options.abortSignal,
            );
          },
        });
      }

      return mcpTools;
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
    abortSignal?: AbortSignal,
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

    const transport = this.createTransport(server);
    if (!transport) {
      throw new Error(`Invalid MCP server configuration for ${server.name}: missing URL`);
    }

    try {
      // Stopping the run cancels the call instead of waiting it out
      await client.connect(transport, { signal: abortSignal });
      const result = await client.callTool(
        {
          name: toolName,
          arguments: args as Record<string, unknown>,
        },
        undefined,
        { signal: abortSignal },
      );
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
