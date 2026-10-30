import type { Tool } from 'ai';
import { randomUUID } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import { z } from 'zod';

import type { ApprovalDecision, ApprovalSettings } from '../agents.approvals';
import { pageForModel } from './connector.tools';
import { defineTool, deniedMessage } from './helpers';
import type { Deps, ToolCallOptions } from './types';

/** stderr kept in the model's result; it is not paged like stdout */
const STDERR_MAX_CHARS = 4 * 1024;

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

/**
 * execute_remote_command. Gates itself on the raw command rather than going
 * through AgentTool's approval wrapper.
 */
export function remoteExecuteTool(
  deps: Deps<'approvals' | 'remoteExecuteService' | 'redisService'>,
  workspaceId: string,
  conversationId: string,
  emitter?: EventEmitter,
  approval?: ApprovalSettings,
): Tool {
  return defineTool({
    description: [
      "Run a shell command on this conversation's worker: built-in tools (display_available_tools type=built_in, called by name) and OS utilities such as dig, curl, ping, whois.",
      'Connector tools (type=connector) do not run here: use run_tool_connector for them.',
      'Params: command (required shell command string).',
      'Output: stdout (first 8KB), stderr, exitCode, error, timedOut, truncated, totalLines.',
      'When truncated is true the full stdout is kept for 1 hour: read it with read_tool_output(runId), filtering with pattern.',
      'Warning: OS-level permissions, no PTY, strict timeout.',
      'The user may reject a command; if so, do not retry it and propose an alternative.',
    ].join('\n'),
    inputSchema,
    execute: async (
      { command }: z.infer<typeof inputSchema>,
      options: ToolCallOptions,
    ) => {
      const { toolCallId } = options;
      const sessionId = randomUUID();

      // Without an approval context (e.g. system-driven runs) nobody can
      // approve, so refuse rather than run unreviewed commands.
      const decision = approval
        ? await deps.approvals.authorize(
            command,
            toolCallId,
            { ...approval, workspaceId, conversationId },
            emitter,
            {
              tool: 'execute_remote_command',
              description: 'Run a shell command on a connected worker',
            },
            options.abortSignal,
          )
        : ({ allowed: false } satisfies ApprovalDecision);
      if (!decision.allowed) {
        return {
          id: sessionId,
          command,
          stdout: '',
          stderr: '',
          exitCode: null,
          error: deniedMessage('Command', decision),
          timedOut: false,
        };
      }

      const { image, ...result } =
        await deps.remoteExecuteService.waitForResult(
          command,
          sessionId,
          conversationId,
          workspaceId,
          60_000,
          (event) => {
            emitter?.emit('remote-execute-output', { toolCallId, ...event });
          },
          options.abortSignal,
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
        deps,
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
    },
  });
}
