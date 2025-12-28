import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AiAssistantService } from './ai-assistant.service';
import type { ClientGrpc } from '@nestjs/microservices';
import { of } from 'rxjs';
import type { LLMConfigService } from './ai-assistant.interface';
import { SortOrder } from '@/common/dtos/get-many-base.dto';

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let llmConfigServiceMock: Partial<LLMConfigService>;
  let clientGrpcMock: Partial<ClientGrpc>;

  beforeEach(async () => {
    llmConfigServiceMock = {
      getLlmConfigs: jest.fn(),
      updateLlmConfig: jest.fn(),
      deleteLlmConfig: jest.fn(),
    };

    clientGrpcMock = {
      getService: jest.fn().mockImplementation((name) => {
        if (name === 'LLMConfigService') {
          return llmConfigServiceMock;
        }
        return {};
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAssistantService,
        {
          provide: 'ASSISTANT_PACKAGE',
          useValue: clientGrpcMock,
        },
      ],
    }).compile();

    service = module.get<AiAssistantService>(AiAssistantService);
    service.onModuleInit(); // Manually trigger init to load services
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('LLM Config', () => {
    const workspaceId = 'ws-123';
    const userId = 'user-123';

    it('getLLMConfigs should return list of configs', async () => {
      const mockResponse = {
        configs: [{ provider: 'openai', apiKey: '****', model: 'gpt-4' }],
        totalCount: 1,
      };

      (llmConfigServiceMock.getLlmConfigs as jest.Mock).mockReturnValue(
        of(mockResponse),
      );

      const result = await service.getLLMConfigs(workspaceId, userId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      });
      expect(result).toEqual(mockResponse);
      expect(llmConfigServiceMock.getLlmConfigs).toHaveBeenCalled();
    });

    it('updateLLMConfig should call service and return config', async () => {
      const dto = {
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4',
      };
      const mockResponse = {
        config: { ...dto, apiKey: '****est' },
        success: true,
      };

      (llmConfigServiceMock.updateLlmConfig as jest.Mock).mockReturnValue(
        of(mockResponse),
      );

      const result = await service.updateLLMConfig(dto, workspaceId, userId);
      expect(result).toEqual(mockResponse);
      expect(llmConfigServiceMock.updateLlmConfig).toHaveBeenCalledWith(
        {
          provider: dto.provider,
          apiKey: dto.apiKey,
          model: dto.model,
          id: '',
        },
        expect.any(Object), // metadata
      );
    });

    it('deleteLLMConfig should return success boolean', async () => {
      const id = 'config-123';
      const mockResponse = { success: true };

      (llmConfigServiceMock.deleteLlmConfig as jest.Mock).mockReturnValue(
        of(mockResponse),
      );

      const result = await service.deleteLLMConfig(id, workspaceId, userId);
      expect(result).toEqual(mockResponse);
      expect(llmConfigServiceMock.deleteLlmConfig).toHaveBeenCalledWith(
        { id },
        expect.any(Object),
      );
    });
  });
});
