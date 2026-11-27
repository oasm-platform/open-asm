import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { AgentMode } from '@/modules/agents/enums/agent.enums';
import { RemoteExecuteService } from '@/modules/remote-execute/remote-execute.service';
import { RedisService } from '@/services/redis/redis.service';

import { AgentsApprovalsService, type ApprovalDecision } from '../agents.approvals';
import {
  AgentsGuardService,
  guardApprovalMeta,
  type ToolPolicy,
} from '../agents.guard';
import { saveHttpLogSession } from '../http-requests/http-log-session';
import { AgentFunction } from './agent-function';
import { pageForModel } from './connector.tools';
import { deniedMessage } from './helpers';
import type { AgentFunctionContext } from './types';

/** stderr kept in the model's result; it is not paged like stdout */
const STDERR_MAX_CHARS = 4 * 1024;

const logger = new Logger('RemoteExecuteTools');

/** The page after a browser command, for the user's Browser panel. */
export interface BrowserScreenshotEvent {
  toolCallId: string;
  command: string;
  /** Base64 JPEG */
  image: string;
  /** The browser session (`b-<id>`) the command ran in */
  browserSessionId?: string;
  /** The subagent that ran the command; unset for the main agent */
  subagent?: { id: string; name: string };
}

/**
 * The browser session a command ran in: the one it names with `-s`, or the
 * one `browser open` started (the first line of its output).
 */
export function browserSessionOf(
  command: string,
  stdout: string,
): string | undefined {
  return (
    /(?:^|\s)-s\s+(b-[0-9a-f]{32})(?=\s|$)/.exec(command)?.[1] ??
    /^session: (b-[0-9a-f]{32})\r?$/m.exec(stdout)?.[1]
  );
}

const inputSchema = z.object({
  command: z.string().min(1).describe('Shell command to execute'),
});

@Injectable()
export class RemoteExecuteTools {
  constructor(
    readonly approvals: AgentsApprovalsService,
    readonly guard: AgentsGuardService,
    readonly remoteExecuteService: RemoteExecuteService,
    readonly redisService: RedisService,
  ) {}

  /**
   * Gates itself on the raw command rather than going through AgentTool's
   * approval wrapper.
   */
  @AgentFunction({
    name: 'execute_remote_command',
    description: [
      "Run a shell command on this conversation's worker: built-in tools (display_available_tools type=built_in, called by name) and OS utilities such as dig, curl, ping, whois.",
      'Connector tools (type=connector) do not run here: use run_tool_connector for them.',
      'Params: command (required shell command string).',
      'Output: stdout (first 8KB), stderr, exitCode, error, timedOut, truncated, totalLines.',
      'The full stdout (not stderr) is kept for 1 hour under runId: when truncated is true read it with read_tool_output(runId), filtering with pattern. Cite runId in propose_vulnerability evidence.',
      'Warning: OS-level permissions, no PTY, strict timeout.',
      'The user may reject a command; if so, do not retry it and propose an alternative.',
    ],
    inputSchema,
    // Runs a shell command on a worker
    permissions: ['worker.write'],
    modes: [AgentMode.AGENT],
    gate: 'self',
  })
  async executeRemoteCommand(
    { command }: z.infer<typeof inputSchema>,
    ctx: AgentFunctionContext,
  ) {
    const { toolCallId, workspaceId, approval, emitter } = ctx;
    const conversationId = ctx.conversationId ?? '';
    const sessionId = randomUUID();

    const refused = (error: string, policy?: ToolPolicy) => ({
      id: sessionId,
      command,
      stdout: '',
      stderr: '',
      exitCode: null,
      error,
      timedOut: false,
      ...(policy ? { policy } : {}),
    });
    // Built-in deny list, workspace rules and scope, in every mode
    const verdict = await this.guard.evaluate({
      tool: 'execute_remote_command',
      input: { command },
      workspaceId,
      conversationId,
      builtin: true,
    });
    if (verdict.action === 'deny') {
      return refused(verdict.message, verdict.policy);
    }
    // Without an approval context (e.g. system-driven runs) nobody can
    // approve, so refuse rather than run unreviewed commands.
    const decision = approval
      ? await this.approvals.authorize(
          command,
          toolCallId,
          { ...approval, workspaceId, conversationId },
          emitter,
          {
            tool: 'execute_remote_command',
            ...guardApprovalMeta(
              verdict,
              'Run a shell command on a connected worker',
            ),
          },
          ctx.abortSignal,
        )
      : ({ allowed: false } satisfies ApprovalDecision);
    if (!decision.allowed) {
      return refused(
        deniedMessage('Command', decision),
        'policy' in verdict ? verdict.policy : undefined,
      );
    }

    const { image, ...result } = await this.remoteExecuteService.waitForResult(
      command,
      sessionId,
      conversationId,
      workspaceId,
      60_000,
      (event) => {
        emitter?.emit('remote-execute-output', { toolCallId, ...event });
      },
      ctx.abortSignal,
      this.httpLogSessionWriter(ctx, sessionId),
    );
    // A browser command comes back with the page as a JPEG: a live view
    // for the user's Browser panel, never stored nor shown to the model
    if (image) {
      const browserSessionId = browserSessionOf(command, result.stdout);
      emitter?.emit('browser-screenshot', {
        toolCallId,
        command,
        image,
        ...(browserSessionId ? { browserSessionId } : {}),
      } satisfies BrowserScreenshotEvent);
    }
    // The live terminal already streamed everything; the model gets the
    // first page, since the result is resent on every later step
    const page = await pageForModel(
      this,
      conversationId,
      sessionId,
      result.stdout,
    );
    return {
      ...result,
      stdout: page.stdout,
      stderr: result.stderr.slice(0, STDERR_MAX_CHARS),
      truncated: page.truncated,
      totalLines: page.totalLines,
      ...(page.runId ? { runId: page.runId } : {}),
      ...(result.stderr.length > STDERR_MAX_CHARS
        ? { stderrTruncated: true }
        : {}),
    };
  }

  /**
   * Records who the command runs for, so the worker's HTTP logs for this
   * session can be stored under the conversation. Without a conversation or
   * a user there is nobody to show them to. Logging is a side channel: a
   * Redis failure must never stop the command.
   */
  private httpLogSessionWriter(
    ctx: AgentFunctionContext,
    sessionId: string,
  ): ((workerId: string) => Promise<void>) | undefined {
    const { conversationId, userId } = ctx;
    if (!conversationId || !userId) return undefined;
    return async (workerId) => {
      try {
        await saveHttpLogSession(this.redisService, sessionId, {
          workspaceId: ctx.workspaceId,
          conversationId,
          createdBy: userId,
          toolCallId: ctx.toolCallId || null,
          subagentId: ctx.subagentId ?? null,
          agentName: ctx.agentName ?? 'main',
          workerId,
        });
      } catch (err) {
        logger.warn(
          `HTTP log session ${sessionId} not saved: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };
  }
}
