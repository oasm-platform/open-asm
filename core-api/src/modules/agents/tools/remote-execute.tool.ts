import type { Tool } from 'ai';
import { randomUUID } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import { z } from 'zod';

import type { ApprovalDecision, ApprovalSettings } from '../agents.approvals';
import { defineTool, deniedMessage } from './helpers';
import type { Deps, ToolCallOptions } from './types';

const inputSchema = z.object({
  command: z.string().min(1).describe('Shell command to execute'),
});

/**
 * execute_remote_command. Gates itself on the raw command rather than going
 * through AgentTool's approval wrapper.
 */
export function remoteExecuteTool(
  deps: Deps<'approvals' | 'remoteExecuteService'>,
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
      'Output: stdout, stderr, exitCode, error, timedOut.',
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

      return deps.remoteExecuteService.waitForResult(
        command,
        sessionId,
        conversationId,
        workspaceId,
        60_000,
        (event) => {
          emitter?.emit('remote-execute-output', { toolCallId, ...event });
        },
      );
    },
  });
}
