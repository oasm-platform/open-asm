import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Injectable, Logger } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { MCPServerResponseDto } from './dto/mcp-config.dto';

interface CachedConnection {
  client: Client;
  tools: Record<string, unknown>;
  cachedAt: number;
}

interface FailedServer {
  failedAt: number;
  retryAfterMs: number;
}

/**
 * Transport protocol detected / configured for a server URL.
 * - streamable-http: MCP Streamable HTTP (spec 2025, POST-based)
 * - sse:            Legacy SSE transport (GET-based)
 */
type TransportType = 'streamable-http' | 'sse';

@Injectable()
export class AgentsMcpService {
  private readonly logger = new Logger(AgentsMcpService.name);

  /** Per-workspace, per-server tool cache (TTL: 5 min). */
  private readonly connectionCache = new Map<string, CachedConnection>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  /** Circuit-breaker: exponential back-off for servers that keep failing. */
  private readonly failedServers = new Map<string, FailedServer>();
  private static readonly INITIAL_RETRY_MS = 30_000;   // 30 s
  private static readonly MAX_RETRY_MS = 10 * 60_000;  // 10 min

  constructor(private readonly agentsService: AgentsService) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async getTools(workspaceId: string): Promise<Record<string, unknown>> {
    const mcpConfig = await this.agentsService.getMCPConfig(workspaceId);
    const enabledServers = mcpConfig.servers.filter((s) => !s.disabled);

    const allTools: Record<string, unknown> = {};
    await Promise.all(
      enabledServers.map(async (server) => {
        const tools = await this.getToolsFromServer(workspaceId, server);
        Object.assign(allTools, tools);
      }),
    );
    return allTools;
  }

  // ── Connection cache helpers ───────────────────────────────────────────────

  private cacheKey(workspaceId: string, serverName: string): string {
    return `${workspaceId}:${serverName}`;
  }

  private isCircuitOpen(key: string): boolean {
    const entry = this.failedServers.get(key);
    if (!entry) return false;
    if (Date.now() >= entry.failedAt + entry.retryAfterMs) {
      // Half-open: allow one probe
      this.failedServers.delete(key);
      return false;
    }
    return true;
  }

  private recordFailure(key: string): void {
    const existing = this.failedServers.get(key);
    const prev = existing?.retryAfterMs ?? AgentsMcpService.INITIAL_RETRY_MS / 2;
    const next = Math.min(prev * 2, AgentsMcpService.MAX_RETRY_MS);
    this.failedServers.set(key, { failedAt: Date.now(), retryAfterMs: next });
  }

  private recordSuccess(key: string): void {
    this.failedServers.delete(key);
  }

  // ── Transport detection ────────────────────────────────────────────────────
  // MCP servers may use Streamable HTTP (spec 2025, POST to /mcp) or legacy SSE.
  // If the URL ends with /sse it is treated as SSE; everything else tries
  // Streamable HTTP first and falls back to SSE automatically.

  private detectTransport(url: string): TransportType {
    const lower = url.toLowerCase();
    if (lower.endsWith('/sse') || lower.includes('/sse?')) return 'sse';
    return 'streamable-http';
  }

  private buildTransport(
    url: string,
    type: TransportType,
  ): StreamableHTTPClientTransport | SSEClientTransport {
    const parsed = new URL(url);
    if (type === 'streamable-http') {
      return new StreamableHTTPClientTransport(parsed);
    }
    return new SSEClientTransport(parsed);
  }

  // ── Core: fetch tools from one server (with cache + circuit-breaker) ───────

  private async getToolsFromServer(
    workspaceId: string,
    server: MCPServerResponseDto,
  ): Promise<Record<string, unknown>> {
    const key = this.cacheKey(workspaceId, server.name);

    // Return cached tools if still fresh
    const cached = this.connectionCache.get(key);
    if (cached && Date.now() - cached.cachedAt < AgentsMcpService.CACHE_TTL_MS) {
      return cached.tools;
    }

    // Circuit-breaker: skip servers that recently failed
    if (this.isCircuitOpen(key)) {
      return {};
    }

    try {
      const tools = await this.fetchTools(server);
      this.connectionCache.set(key, { client: null as unknown as Client, tools, cachedAt: Date.now() });
      this.recordSuccess(key);
      return tools;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`MCP connection error for ${server.name}: ${message}`);
      this.recordFailure(key);
      // Evict stale cache on failure
      this.connectionCache.delete(key);
      return {};
    }
  }

  // ── Low-level: connect, list tools, disconnect ─────────────────────────────

  private async fetchTools(
    server: MCPServerResponseDto,
  ): Promise<Record<string, unknown>> {
    if (!server.url && !server.command) return {};

    const client = this.makeClient();

    if (server.url) {
      const transportType = this.detectTransport(server.url);
      const transport = this.buildTransport(server.url, transportType);
      try {
        await client.connect(transport);
      } catch (err) {
        // If Streamable HTTP fails with 4xx, retry with SSE as fallback
        if (
          transportType === 'streamable-http' &&
          err instanceof Error &&
          /4\d\d|not supported/i.test(err.message)
        ) {
          this.logger.warn(
            `${server.name}: Streamable HTTP failed (${err.message}), retrying with SSE`,
          );
          const fallback = new SSEClientTransport(new URL(server.url));
          await client.connect(fallback);
        } else {
          throw err;
        }
      }
    } else {
      const transport = new StdioClientTransport({
        command: server.command!,
        args: server.args ?? [],
        env: { ...process.env, ...(server.env ?? {}) } as Record<string, string>,
      });
      await client.connect(transport);
    }

    try {
      const { tools } = await client.listTools();
      const mcpTools: Record<string, unknown> = {};

      for (const t of tools) {
        const toolName = `${server.name}_${t.name}`;
        mcpTools[toolName] = {
          description: t.description ?? `MCP tool ${t.name} from ${server.name}`,
          parameters: t.inputSchema,
          execute: async (params: unknown) =>
            this.callTool(server, t.name, params),
        };
      }

      return mcpTools;
    } finally {
      await client.close().catch(() => {});
    }
  }

  // ── Tool execution (opens a fresh connection per call) ─────────────────────

  private async callTool(
    server: MCPServerResponseDto,
    toolName: string,
    args: unknown,
  ): Promise<unknown> {
    if (!server.url && !server.command) {
      throw new Error(`Invalid MCP server configuration for ${server.name}`);
    }

    const client = this.makeClient();

    if (server.url) {
      const transportType = this.detectTransport(server.url);
      await client.connect(this.buildTransport(server.url, transportType));
    } else {
      await client.connect(
        new StdioClientTransport({
          command: server.command!,
          args: server.args ?? [],
          env: { ...process.env, ...(server.env ?? {}) } as Record<string, string>,
        }),
      );
    }

    try {
      return await client.callTool({
        name: toolName,
        arguments: args as Record<string, unknown>,
      });
    } finally {
      await client.close().catch(() => {});
    }
  }

  private makeClient(): Client {
    return new Client(
      { name: 'OASM-Security-Agent', version: '1.0.0' },
      { capabilities: {} },
    );
  }
}
