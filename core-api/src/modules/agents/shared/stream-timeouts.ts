import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';

import { APPROVAL_TIMEOUT_MS } from '../agents.approvals';

/**
 * Wait for the first output of each model call. `chunkMs` does not cover it,
 * so without this a provider that accepts the request and never answers
 * (seen with a gateway handed a multi-megabyte prompt) hangs the run until
 * the user stops it. Reasoning deltas count as output.
 */
export const FIRST_CHUNK_TIMEOUT_MS = 120_000;

/** Gap allowed between chunks once output has started */
const CHUNK_TIMEOUT_MS = 30_000;

/**
 * The `timeout` of a chat turn's streamText. A tool call may sit waiting for
 * the user's approval (Agent mode, or any mode unless approvals are off),
 * which emits no chunks, so the chunk gap then allows the approval window.
 */
export function streamTimeouts(
  agentMode?: AgentMode,
  approvalMode?: AgentApprovalMode,
): { firstChunkMs: number; chunkMs: number } {
  const waitsForApproval =
    agentMode === AgentMode.AGENT || approvalMode !== AgentApprovalMode.AUTO;
  return {
    firstChunkMs: FIRST_CHUNK_TIMEOUT_MS,
    chunkMs: waitsForApproval ? APPROVAL_TIMEOUT_MS + 60_000 : CHUNK_TIMEOUT_MS,
  };
}
