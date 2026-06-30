import { API_GLOBAL_PREFIX } from '@/common/constants/app.constants';
import { AgentMode } from '@/common/enums/enum';
import { AgentTool } from '@/modules/agents/agents.tools';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { Request, Response } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';

interface AiToolLike {
  description: string;
  parameters: z.ZodTypeAny;
  execute: (
    args: unknown,
    options?: { toolCallId?: string },
  ) => Promise<unknown>;
}

interface McpSession {
  transport: SSEServerTransport;
  server: McpServer;
  workspaceId: string;
  createdAt: number;
}

function schemaToShape(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  private readonly sessions = new Map<string, McpSession>();

  private static readonly SESSION_TTL = 30 * 60 * 1000;
  private static readonly MAX_SESSIONS = 100;
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000;

  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly agentTool: AgentTool) {}

  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => {
      this.evictStaleSessions();
    }, McpService.CLEANUP_INTERVAL);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private evictStaleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.createdAt > McpService.SESSION_TTL) {
        this.logger.log(`Evicting stale session ${id}`);
        this.sessions.delete(id);
      }
    }
  }

  async handleSSEConnection(
    workspaceId: string,
    _req: Request,
    res: Response,
  ): Promise<void> {
    const messageEndpoint = `/${API_GLOBAL_PREFIX}/mcp/message`;
    const transport = new SSEServerTransport(
      messageEndpoint,
      res as unknown as ServerResponse,
    );

    const server = this.createMcpServer(workspaceId);

    if (this.sessions.size >= McpService.MAX_SESSIONS) {
      this.evictStaleSessions();
      // If still at capacity after TTL eviction, evict the single oldest session
      if (this.sessions.size >= McpService.MAX_SESSIONS) {
        let oldestId = '';
        let oldestTime = Infinity;
        for (const [id, session] of this.sessions.entries()) {
          if (session.createdAt < oldestTime) {
            oldestTime = session.createdAt;
            oldestId = id;
          }
        }
        if (oldestId) {
          this.logger.warn(`Evicting oldest session ${oldestId} to stay under capacity`);
          this.sessions.delete(oldestId);
        }
      }
    }

    this.sessions.set(transport.sessionId, {
      transport,
      server,
      workspaceId,
      createdAt: Date.now(),
    });

    transport.onclose = () => {
      this.logger.log(`MCP session ${transport.sessionId} closed`);
      this.sessions.delete(transport.sessionId);
    };

    transport.onerror = (error) => {
      this.logger.error(`MCP session ${transport.sessionId} error: ${error.message}`);
    };

    await server.connect(transport);
  }

  async handleMessage(req: Request, res: Response): Promise<void> {
    const sessionId = req.query.sessionId as string;
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.status(404).json({ error: 'MCP session not found' });
      return;
    }

    // Body is parsed by express.json() middleware (configured in McpServerModule)
    await session.transport.handlePostMessage(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      (req as unknown as Record<string, unknown>).body,
    );
  }

  private createMcpServer(workspaceId: string): McpServer {
    const server = new McpServer({
      name: 'oasm-server',
      version: '1.0.0',
    });

    this.registerTools(server, workspaceId);

    return server;
  }

  private registerTools(server: McpServer, workspaceId: string): void {
    const allTools = this.agentTool.getTools(workspaceId, AgentMode.AGENT, undefined, undefined, true);

    for (const [name, toolInstance] of Object.entries(allTools)) {
      try {
        this.registerToolOnServer(server, name, toolInstance as AiToolLike);
        this.logger.debug(`Registered MCP tool: ${name}`);
      } catch (error) {
        this.logger.error(`Failed to register MCP tool ${name}: ${error}`);
      }
    }
  }


  private registerToolOnServer(server: McpServer, name: string, aiTool: AiToolLike): void {
    try {
      const execute = aiTool.execute;

      const shape = schemaToShape(aiTool.parameters);

      server.tool(name, aiTool.description, shape, async (...args: unknown[]) => {
        try {
          const result = await execute(args[0]);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        } catch (error) {
          this.logger.error(`Tool execution error: ${error instanceof Error ? error.message : String(error)}`);
          return {
            content: [{ type: 'text' as const, text: 'Error: Internal error' }],
            isError: true,
          };
        }
      });
    } catch (error) {
      this.logger.error(`Failed to register tool ${name}: ${error}`);
    }
  }
}
