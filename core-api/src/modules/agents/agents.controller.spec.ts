import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { llmProviderSupported } from './llm-provider-supported';

jest.mock('@/common/guards/auth.guard', () => ({
  AuthGuard: jest.fn().mockImplementation(() => ({
    canActivate: jest.fn().mockReturnValue(true),
  })),
}));

describe('AgentsController', () => {
  let controller: AgentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        {
          provide: AgentsService,
          useValue: {
            createLLMConfig: jest.fn(),
            getLLMConfigs: jest.fn(),
            updateLLMConfig: jest.fn(),
            deleteLLMConfig: jest.fn(),
            setPreferredLLMConfig: jest.fn(),
            getConversations: jest.fn(),
            updateConversation: jest.fn(),
            deleteConversation: jest.fn(),
            sendMessageStream: jest.fn(),
            getMessages: jest.fn(),
            deleteMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AgentsController>(AgentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLLMProvidersSupported', () => {
    it('should return all supported LLM providers', () => {
      const result = controller.getLLMProvidersSupported();

      expect(result).toEqual(llmProviderSupported);
      expect(result).toHaveLength(llmProviderSupported.length);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
    });

    it('should return providers with correct structure', () => {
      const result = controller.getLLMProvidersSupported();

      result.forEach((provider) => {
        expect(provider).toHaveProperty('id');
        expect(provider).toHaveProperty('name');
        expect(typeof provider.id).toBe('string');
        expect(typeof provider.name).toBe('string');
      });
    });
  });
});
