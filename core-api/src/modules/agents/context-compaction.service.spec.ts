import type { Repository } from 'typeorm';
import type { ResolvedLLMConfig } from './agents.config';
import type { AgentsModelsCatalogService } from './agents.models-catalog';
import { ContextCompactionService } from './context-compaction.service';
import type { ConversationTitleService } from './conversation-title.service';
import type { AgentConversation } from './entities/agent-conversation.entity';
import type { AgentMessage } from './entities/agent-message.entity';
import type { LlmConfigResolver } from './llm-config.resolver';

describe('ContextCompactionService', () => {
  const llmConfig = { workspaceId: 'w1', provider: 'openai' } as ResolvedLLMConfig;
  let messages: { find: jest.Mock };
  let conversations: { findOne: jest.Mock; update: jest.Mock };
  let completeText: jest.Mock;
  let service: ContextCompactionService;

  beforeEach(() => {
    messages = {
      find: jest.fn().mockResolvedValue([
        { id: 'm2', role: 'assistant', content: 'found 3 hosts' },
        { id: 'm1', role: 'user', content: 'scan example.com' },
      ]),
    };
    conversations = {
      findOne: jest.fn().mockResolvedValue({ id: 'c1', summary: 'earlier' }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    completeText = jest.fn().mockResolvedValue('summary');
    service = new ContextCompactionService(
      conversations as unknown as Repository<AgentConversation>,
      messages as unknown as Repository<AgentMessage>,
      {
        resolveWindow: () => ({ tokens: 1_000 }),
      } as unknown as AgentsModelsCatalogService,
      {
        createLanguageModel: jest.fn().mockResolvedValue({}),
      } as unknown as LlmConfigResolver,
      { completeText } as unknown as ConversationTitleService,
    );
  });

  const big = ['x'.repeat(4_000)];

  it('summarizes once past 60% of the window, keeping the previous summary in', async () => {
    await service.handlePostStreamCompaction('c1', llmConfig, big, []);

    expect(completeText).toHaveBeenCalledTimes(1);
    expect(conversations.update).toHaveBeenCalledWith({ id: 'c1' }, { summary: 'summary' });
  });

  it('leaves a conversation under the threshold alone', async () => {
    await service.handlePostStreamCompaction('c1', llmConfig, ['short'], []);

    expect(completeText).not.toHaveBeenCalled();
  });

  it('joins a compaction already running for the conversation', async () => {
    await Promise.all([
      service.handlePostStreamCompaction('c1', llmConfig, big, []),
      service.handlePostStreamCompaction('c1', llmConfig, big, []),
    ]);

    expect(completeText).toHaveBeenCalledTimes(1);
  });

  it('never fails the turn when summarizing fails', async () => {
    completeText.mockRejectedValue(new Error('provider down'));

    await expect(
      service.handlePostStreamCompaction('c1', llmConfig, big, []),
    ).resolves.toBeUndefined();
    expect(conversations.update).not.toHaveBeenCalled();
  });
});
