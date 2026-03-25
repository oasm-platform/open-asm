import { encrypt } from '@/common/utils/encryption.util';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AgentsService } from './agents.service';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { LLMProvider, MessageRole, MessageType } from './enums/agent.enums';

jest.mock('@/common/utils/encryption.util', () => ({
  encrypt: jest.fn((text: string) => `encrypted:${text}`),
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
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => (model: string) => ({
    model,
    provider: 'openai',
  })),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => (model: string) => ({
    model,
    provider: 'anthropic',
  })),
}));

describe('AgentsService', () => {
  let service: AgentsService;
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
        AgentsService,
        {
          provide: getRepositoryToken(AgentLLMConfig),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
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

    service = module.get<AgentsService>(AgentsService);
    llmConfigRepository = module.get(getRepositoryToken(AgentLLMConfig));
    conversationRepository = module.get(getRepositoryToken(AgentConversation));
    messageRepository = module.get(getRepositoryToken(AgentMessage));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================
  // LLM Config Tests
  // ==========================================

  describe('createLLMConfig', () => {
    it('should create and return a masked LLM config', async () => {
      const dto = {
        provider: LLMProvider.OPENAI,
        apiKey: 'sk-test1234',
        model: 'gpt-4o',
      };

      jest.spyOn(llmConfigRepository, 'create').mockReturnValue(mockLlmConfig);
      jest.spyOn(llmConfigRepository, 'save').mockResolvedValue(mockLlmConfig);

      const result = await service.createLLMConfig(
        dto,
        mockWorkspaceId,
        mockUserId,
      );

      expect(encrypt).toHaveBeenCalledWith('sk-test1234');
      expect(llmConfigRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          provider: LLMProvider.OPENAI,
          model: 'gpt-4o',
          createdBy: mockUserId,
        }),
      );
      expect(result.apiKeyMasked).toBe('*******1234');
    });
  });

  describe('updateLLMConfig', () => {
    it('should update an existing LLM config', async () => {
      const dto = { model: 'gpt-4o-mini' };

      jest
        .spyOn(llmConfigRepository, 'findOne')
        .mockResolvedValue(mockLlmConfig);
      jest.spyOn(llmConfigRepository, 'save').mockResolvedValue({
        ...mockLlmConfig,
        model: 'gpt-4o-mini',
      });

      const result = await service.updateLLMConfig(
        mockLlmConfig.id,
        dto,
        mockWorkspaceId,
      );

      expect(result.model).toBe('gpt-4o-mini');
    });

    it('should throw NotFoundException when config not found', async () => {
      jest.spyOn(llmConfigRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateLLMConfig('non-existent', {}, mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteLLMConfig', () => {
    it('should delete an LLM config', async () => {
      jest
        .spyOn(llmConfigRepository, 'findOne')
        .mockResolvedValue(mockLlmConfig);
      jest
        .spyOn(llmConfigRepository, 'remove')
        .mockResolvedValue(mockLlmConfig);

      await service.deleteLLMConfig(mockLlmConfig.id, mockWorkspaceId);

      expect(llmConfigRepository.remove).toHaveBeenCalledWith(mockLlmConfig);
    });

    it('should throw NotFoundException when config not found', async () => {
      jest.spyOn(llmConfigRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.deleteLLMConfig('non-existent', mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setPreferredLLMConfig', () => {
    it('should set a config as preferred and unset others', async () => {
      jest
        .spyOn(llmConfigRepository, 'findOne')
        .mockResolvedValue(mockLlmConfig);
      jest.spyOn(llmConfigRepository, 'update').mockResolvedValue({} as any);
      jest.spyOn(llmConfigRepository, 'save').mockResolvedValue({
        ...mockLlmConfig,
        isPreferred: true,
      });

      const result = await service.setPreferredLLMConfig(
        mockLlmConfig.id,
        mockWorkspaceId,
      );

      expect(llmConfigRepository.update).toHaveBeenCalledWith(
        { workspaceId: mockWorkspaceId, isPreferred: true },
        { isPreferred: false },
      );
      expect(result.isPreferred).toBe(true);
    });
  });

  // ==========================================
  // Conversation Tests
  // ==========================================

  describe('updateConversation', () => {
    it('should update conversation title', async () => {
      const dto = { title: 'Updated title' };

      jest
        .spyOn(conversationRepository, 'findOne')
        .mockResolvedValue(mockConversation);
      jest.spyOn(conversationRepository, 'save').mockResolvedValue({
        ...mockConversation,
        title: 'Updated title',
      });

      const result = await service.updateConversation(
        mockConversation.id,
        dto,
        mockWorkspaceId,
      );

      expect(result.title).toBe('Updated title');
    });

    it('should throw NotFoundException when conversation not found', async () => {
      jest.spyOn(conversationRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateConversation('non-existent', {}, mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      jest
        .spyOn(conversationRepository, 'findOne')
        .mockResolvedValue(mockConversation);
      jest
        .spyOn(conversationRepository, 'remove')
        .mockResolvedValue(mockConversation);

      await service.deleteConversation(mockConversation.id, mockWorkspaceId);

      expect(conversationRepository.remove).toHaveBeenCalledWith(
        mockConversation,
      );
    });
  });

  // ==========================================
  // Message Tests
  // ==========================================

  describe('getMessages', () => {
    it('should return messages for a conversation', async () => {
      jest
        .spyOn(conversationRepository, 'findOne')
        .mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([mockMessage]);

      const result = await service.getMessages(
        mockConversation.id,
        mockWorkspaceId,
      );

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello');
    });

    it('should throw NotFoundException when conversation not found', async () => {
      jest.spyOn(conversationRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.getMessages('non-existent', mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message', async () => {
      jest
        .spyOn(conversationRepository, 'findOne')
        .mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'findOne').mockResolvedValue(mockMessage);
      jest.spyOn(messageRepository, 'remove').mockResolvedValue(mockMessage);

      await service.deleteMessage(
        mockConversation.id,
        mockMessage.id,
        mockWorkspaceId,
      );

      expect(messageRepository.remove).toHaveBeenCalledWith(mockMessage);
    });

    it('should throw NotFoundException when message not found', async () => {
      jest
        .spyOn(conversationRepository, 'findOne')
        .mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.deleteMessage(
          mockConversation.id,
          'non-existent',
          mockWorkspaceId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMessageStream', () => {
    it('should throw BadRequestException when no preferred config exists', async () => {
      jest.spyOn(service, 'getPreferredLLMConfig').mockResolvedValue(null);

      await expect(
        service.sendMessageStream(
          { question: 'Hello' },
          mockWorkspaceId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create new conversation when conversationId not provided', async () => {
      jest
        .spyOn(service, 'getPreferredLLMConfig')
        .mockResolvedValue(mockLlmConfig);
      jest
        .spyOn(conversationRepository, 'create')
        .mockReturnValue(mockConversation);
      jest
        .spyOn(conversationRepository, 'save')
        .mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'create').mockReturnValue(mockMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(mockMessage);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest
        .spyOn(llmConfigRepository, 'findOne')
        .mockResolvedValue(mockLlmConfig);

      const observable = await service.sendMessageStream(
        { question: 'Hello' },
        mockWorkspaceId,
        mockUserId,
      );

      expect(observable).toBeDefined();
      expect(conversationRepository.create).toHaveBeenCalled();
    });

    it('should use existing conversation when conversationId provided', async () => {
      jest
        .spyOn(conversationRepository, 'findOne')
        .mockResolvedValue(mockConversation);
      jest.spyOn(messageRepository, 'create').mockReturnValue(mockMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(mockMessage);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest
        .spyOn(llmConfigRepository, 'findOne')
        .mockResolvedValue(mockLlmConfig);

      const observable = await service.sendMessageStream(
        { question: 'Hello', conversationId: mockConversation.id },
        mockWorkspaceId,
        mockUserId,
      );

      expect(observable).toBeDefined();
    });

    it('should throw NotFoundException when conversation not found', async () => {
      jest.spyOn(conversationRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.sendMessageStream(
          { question: 'Hello', conversationId: 'non-existent' },
          mockWorkspaceId,
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
