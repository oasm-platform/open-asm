import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';

import { APPROVAL_TIMEOUT_MS } from '../agents.approvals';
import { FIRST_CHUNK_TIMEOUT_MS, streamTimeouts } from './stream-timeouts';

describe('streamTimeouts', () => {
  it('gives up on a model that never starts answering, in every mode', () => {
    for (const agentMode of [AgentMode.ASK, AgentMode.AGENT]) {
      for (const approvalMode of Object.values(AgentApprovalMode)) {
        expect(streamTimeouts(agentMode, approvalMode).firstChunkMs).toBe(
          FIRST_CHUNK_TIMEOUT_MS,
        );
      }
    }
  });

  it('allows 30 s between chunks when no tool call can wait for approval', () => {
    expect(
      streamTimeouts(AgentMode.ASK, AgentApprovalMode.AUTO).chunkMs,
    ).toBe(30_000);
  });

  it('allows the approval window between chunks when a prompt can be pending', () => {
    const window = APPROVAL_TIMEOUT_MS + 60_000;
    expect(
      streamTimeouts(AgentMode.AGENT, AgentApprovalMode.AUTO).chunkMs,
    ).toBe(window);
    expect(
      streamTimeouts(AgentMode.ASK, AgentApprovalMode.MANUAL).chunkMs,
    ).toBe(window);
  });
});
