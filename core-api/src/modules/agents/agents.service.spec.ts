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

function buildService(found: unknown = conversation, detail: unknown = null) {
  const subagents = [{ id: 'sa-1', name: 'worker', status: 'in_progress' }];
  const service = Object.assign(Object.create(AgentsService.prototype), {
    conversationRepository: { findOne: jest.fn().mockResolvedValue(found) },
    todoRepository: { find: jest.fn().mockResolvedValue([]) },
    subagents: {
      listForConversation: jest.fn().mockResolvedValue(subagents),
      getDetail: jest.fn().mockResolvedValue(detail),
    },
  }) as AgentsService;
  return { service, subagents };
}

describe('AgentsService.getConversationSubagent', () => {
  const getDetail = (service: AgentsService) =>
    (service as unknown as { subagents: { getDetail: jest.Mock } }).subagents
      .getDetail;

  it('returns the subagent with its transcript', async () => {
    const detail = { id: 'sa-1', transcript: [], transcriptTruncated: false };
    const { service } = buildService(conversation, detail);

    await expect(
      service.getConversationSubagent('conv-1', 'sa-1', 'ws-1', 'user-1'),
    ).resolves.toEqual(detail);
    expect(getDetail(service)).toHaveBeenCalledWith('conv-1', 'sa-1');
  });

  it('hides subagents of a conversation the user cannot see', async () => {
    const { service } = buildService(null);

    await expect(
      service.getConversationSubagent('conv-1', 'sa-1', 'ws-1', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(getDetail(service)).not.toHaveBeenCalled();
  });

  it('404s an unknown subagent', async () => {
    const { service } = buildService(conversation, null);

    await expect(
      service.getConversationSubagent('conv-1', 'sa-x', 'ws-1', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

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
