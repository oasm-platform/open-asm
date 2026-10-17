import { NotFoundException } from '@nestjs/common';
import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import { AgentsService } from './agents.service';

const conversation = {
  id: 'conv-1',
  llmConfigId: 'llm-1',
  title: 'Recon',
  agentMode: AgentMode.AGENT,
  approvalMode: AgentApprovalMode.MANUAL,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  metadata: { model: 'm' },
};

function buildService(found: unknown = conversation) {
  const subagents = [{ id: 'sa-1', name: 'worker', status: 'in_progress' }];
  const service = Object.assign(Object.create(AgentsService.prototype), {
    conversationRepository: { findOne: jest.fn().mockResolvedValue(found) },
    todoRepository: { find: jest.fn().mockResolvedValue([]) },
    subagents: {
      listForConversation: jest.fn().mockResolvedValue(subagents),
    },
  }) as AgentsService;
  return { service, subagents };
}

describe('AgentsService.getConversation', () => {
  it('includes the subagents of the conversation', async () => {
    const { service, subagents } = buildService();

    const result = await service.getConversation('conv-1', 'ws-1', 'user-1');

    expect(result.subagents).toEqual(subagents);
  });

  it('does not list subagents of a conversation the user cannot see', async () => {
    const { service } = buildService(null);

    await expect(
      service.getConversation('conv-1', 'ws-1', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (service as unknown as { subagents: { listForConversation: jest.Mock } })
        .subagents.listForConversation,
    ).not.toHaveBeenCalled();
  });
});
