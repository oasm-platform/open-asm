import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

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
            getLLMProvidersStatus: jest.fn(),
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
});
