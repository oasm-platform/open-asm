import { Test, TestingModule } from '@nestjs/testing';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

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
});
