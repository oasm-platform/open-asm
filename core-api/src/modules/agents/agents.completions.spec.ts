import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AgentsCompletionsService } from './agents.completions';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { LLMProvider, MessageRole, MessageType } from './enums/agent.enums';
import { AgentTool } from './agents.tools';

jest.mock('@/common/utils/encryption.util', () => ({
  decrypt: jest.fn((text: string) => text.replace('encrypted:', '')),
}));

jest.mock('ai', () => ({
  streamText: jest.fn(() => ({
    textStream: (async function* () {
      await Promise.resolve();
      yield 'Hello';
      yield ' ';
      yield 'world!';
    })(),
  })),
  generateText: jest.fn(),
  createUIMessageStreamResponse: jest.fn(() => new ReadableStream()),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => ({
    chat: jest.fn((model: string) => ({
      model,
      provider: 'openai',
    })),
  })),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => (model: string) => ({
    model,
    provider: 'anthropic',
  })),
}));

describe('AgentsCompletionsService', () => {
  let service: AgentsCompletionsService;
  let llmConfigRepository: Repository<AgentLLMConfig>;
  let conversationRepository: Repository<AgentConversation>;
  let messageRepository: Repository<AgentMessage>;

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440001';

  const mockLlmConfig: AgentLLMConfig = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    workspaceId: mockWorkspaceId,
    provider: LLMProvider.OPENAI,
    apiKey: 'encrypted:sk-test1234',
    model: 'gpt-4o',
    apiUrl: undefined,
    isPreferred: true,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AgentLLMConfig;

  const mockConversation: AgentConversation = {
    id: '550e8400-e29b-41d4-a716-446655440003',
    workspaceId: mockWorkspaceId,
    llmConfigId: mockLlmConfig.id,
    title: 'Test conversation',
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AgentConversation;

  const mockMessage: AgentMessage = {
    id: '550e8400-e29b-41d4-a716-446655440004',
    conversationId: mockConversation.id,
    role: MessageRole.USER,
    content: 'Hello',
    messageType: MessageType.TEXT,
    metadata: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AgentMessage;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsCompletionsService,
        AgentTool,
        {
          provide: getRepositoryToken(AgentLLMConfig),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
            })),
          },
        },
        {
          provide: getRepositoryToken(AgentConversation),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
            })),
          },
        },
        {
          provide: getRepositoryToken(AgentMessage),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentsCompletionsService>(AgentsCompletionsService);
    llmConfigRepository = module.get(getRepositoryToken(AgentLLMConfig));
    conversationRepository = module.get(getRepositoryToken(AgentConversation));
    messageRepository = module.get(getRepositoryToken(AgentMessage));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('streamMessage', () => {
    it('should throw BadRequestException when no preferred config exists', async () => {
      jest.spyOn(service as any, 'getPreferredLLMConfig').mockResolvedValue(null);

      await expect(
        service.streamMessage(
          { question: 'Hello' },
          mockWorkspaceId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create new conversation when conversationId not provided', async () => {
      jest.spyOn(service as any, 'getPreferredLLMConfig').mockResolvedValue(mockLlmConfig);
      jest.spyOn(conversationRepository, 'create').mockReturnValue(mockConversation);
      jest.spyOn(conversationRepository, 'save').mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'create').mockReturnValue(mockMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(mockMessage);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(llmConfigRepository, 'findOne').mockResolvedValue(mockLlmConfig);

      const stream = await service.streamMessage(
        { question: 'Hello' },
        mockWorkspaceId,
        mockUserId,
      );

      expect(stream).toBeDefined();
      expect(stream.conversationId).toBe(mockConversation.id);
      expect(conversationRepository.create).toHaveBeenCalled();
    });

    it('should use existing conversation when conversationId provided', async () => {
      jest.spyOn(conversationRepository, 'findOne').mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'create').mockReturnValue(mockMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(mockMessage);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(llmConfigRepository, 'findOne').mockResolvedValue(mockLlmConfig);

      const stream = await service.streamMessage(
        { question: 'Hello', conversationId: mockConversation.id },
        mockWorkspaceId,
        mockUserId,
      );

      expect(stream).toBeDefined();
      expect(stream.conversationId).toBe(mockConversation.id);
    });

    it('should create new conversation when conversationId provided but not found', async () => {
      jest.spyOn(conversationRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(llmConfigRepository, 'findOne').mockResolvedValue(mockLlmConfig);
      jest.spyOn(conversationRepository, 'create').mockReturnValue(mockConversation);
      jest.spyOn(conversationRepository, 'save').mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'create').mockReturnValue(mockMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(mockMessage);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);

      const stream = await service.streamMessage(
        { question: 'Hello', conversationId: 'non-existent' },
        mockWorkspaceId,
        mockUserId,
      );

      expect(stream).toBeDefined();
      expect(stream.conversationId).toBe(mockConversation.id);
      expect(conversationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'non-existent',
        }),
      );
    });

    it('should throw NotFoundException when LLM config not found', async () => {
      jest.spyOn(service as any, 'getPreferredLLMConfig').mockResolvedValue(mockLlmConfig);
      jest.spyOn(conversationRepository, 'create').mockReturnValue(mockConversation);
      jest.spyOn(conversationRepository, 'save').mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'create').mockReturnValue(mockMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(mockMessage);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(llmConfigRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.streamMessage(
          { question: 'Hello' },
          mockWorkspaceId,
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});