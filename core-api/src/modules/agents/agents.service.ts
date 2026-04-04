import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { decrypt, encrypt } from '@/common/utils/encryption.util';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConversationResponseDto,
  UpdateConversationDto,
} from './dto/conversation.dto';
import {
  CreateLLMConfigDto,
  LLMConfigResponseDto,
  LLMConfigWithProviderDto,
  LLMProviderStatusDto,
  ProviderModelDto,
  UpdateLLMConfigDto,
} from './dto/llm-config.dto';
import { MessageResponseDto } from './dto/message.dto';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { LLMProvider } from './enums/agent.enums';
import {
  getLLMProviderConfig,
  llmProviderSupported,
} from './llm-provider-supported';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private systemPrompt: string | null = null;

  constructor(
    @InjectRepository(AgentLLMConfig)
    private readonly llmConfigRepository: Repository<AgentLLMConfig>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,
  ) {}

  private maskApiKey(apiKey: string): string {
    if (apiKey.length <= 4) return '****';
    return '*'.repeat(apiKey.length - 4) + apiKey.slice(-4);
  }

  private toLLMConfigResponse(config: AgentLLMConfig): LLMConfigResponseDto {
    const decryptedKey = decrypt(config.apiKey);
    return {
      id: config.id,
      provider: config.provider,
      model: config.model,
      apiUrl: config.apiUrl,
      isPreferred: config.isPreferred,
      apiKeyMasked: this.maskApiKey(decryptedKey),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  async createLLMConfig(
    dto: CreateLLMConfigDto,
    workspaceId: string,
    userId: string,
  ): Promise<LLMConfigResponseDto> {
    // Check if provider already exists in workspace
    const existingConfig = await this.llmConfigRepository.findOne({
      where: { workspaceId, provider: dto.provider },
    });

    if (existingConfig) {
      throw new BadRequestException(
        `Provider ${dto.provider} is already configured. Please update or delete the existing configuration first.`,
      );
    }

    // Validate API key by fetching models
    const provider = getLLMProviderConfig(dto.provider);
    if (!provider) {
      throw new BadRequestException(`Provider ${dto.provider} is not supported`);
    }

    const models = await provider.fetchModels(dto.apiKey);

    if (models.length === 0) {
      throw new BadRequestException(
        'Invalid API key. Unable to fetch models from the provider.',
      );
    }

    // Use first model from the list as default
    const defaultModel = models[0].id;

    // Check if this is the first LLM config in workspace
    const totalConfigs = await this.llmConfigRepository.count({
      where: { workspaceId },
    });

    const isPreferred = totalConfigs === 0;

    const config = this.llmConfigRepository.create({
      workspaceId,
      provider: dto.provider,
      apiKey: encrypt(dto.apiKey),
      model: dto.model || defaultModel,
      apiUrl: dto.apiUrl,
      createdBy: userId,
      isPreferred,
    });

    const saved = await this.llmConfigRepository.save(config);
    return this.toLLMConfigResponse(saved);
  }

  async getLLMProvidersStatus(
    workspaceId: string,
  ): Promise<LLMProviderStatusDto[]> {
    const configs = await this.llmConfigRepository.find({
      where: { workspaceId },
    });

    const configMap = new Map(
      configs.map((c) => [c.provider, this.toLLMConfigResponse(c)]),
    );

    return llmProviderSupported.map((provider) => ({
      id: provider.id,
      name: provider.name,
      logo: provider.logo,
      isConnected: configMap.has(provider.id),
      config: configMap.get(provider.id) ?? null,
    }));
  }

  async getLLMConfigsWithProviders(
    workspaceId: string,
  ): Promise<LLMConfigWithProviderDto[]> {
    // Get all configs for workspace
    const configs = await this.llmConfigRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });

    // Map providers with their config status
    const result = llmProviderSupported.map((provider) => {
      const config = configs.find((c) => c.provider === provider.id);

      if (config) {
        const decryptedKey = decrypt(config.apiKey);
        return {
          providerId: provider.id,
          providerName: provider.name,
          logo: provider.logo,
          isConnected: true,
          configId: config.id,
          model: config.model,
          apiUrl: config.apiUrl,
          isPreferred: config.isPreferred,
          apiKeyMasked: this.maskApiKey(decryptedKey),
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        };
      }

      return {
        providerId: provider.id,
        providerName: provider.name,
        logo: provider.logo,
        isConnected: false,
      };
    });

    return result as LLMConfigWithProviderDto[];
  }

  async updateLLMConfig(
    id: string,
    dto: UpdateLLMConfigDto,
    workspaceId: string,
  ): Promise<LLMConfigResponseDto> {
    const config = await this.llmConfigRepository.findOne({
      where: { id, workspaceId },
    });

    if (!config) {
      throw new NotFoundException('LLM config not found');
    }

    if (dto.apiKey) {
      config.apiKey = encrypt(dto.apiKey);
    }
    if (dto.provider !== undefined) config.provider = dto.provider;
    if (dto.model !== undefined) config.model = dto.model;
    if (dto.apiUrl !== undefined) config.apiUrl = dto.apiUrl;
    if (dto.isPreferred !== undefined) config.isPreferred = dto.isPreferred;

    const saved = await this.llmConfigRepository.save(config);
    return this.toLLMConfigResponse(saved);
  }

  async deleteLLMConfig(id: string, workspaceId: string): Promise<void> {
    const config = await this.llmConfigRepository.findOne({
      where: { id, workspaceId },
    });

    if (!config) {
      throw new NotFoundException('LLM config not found');
    }

    await this.llmConfigRepository.remove(config);
  }

  async setPreferredLLMConfig(
    id: string,
    workspaceId: string,
  ): Promise<LLMConfigResponseDto> {
    const config = await this.llmConfigRepository.findOne({
      where: { id, workspaceId },
    });

    if (!config) {
      throw new NotFoundException('LLM config not found');
    }

    // Unset all other preferred configs in workspace
    await this.llmConfigRepository.update(
      { workspaceId, isPreferred: true },
      { isPreferred: false },
    );

    config.isPreferred = true;
    const saved = await this.llmConfigRepository.save(config);
    return this.toLLMConfigResponse(saved);
  }

  async getPreferredLLMConfig(
    workspaceId: string,
  ): Promise<AgentLLMConfig | null> {
    return this.llmConfigRepository.findOne({
      where: { workspaceId, isPreferred: true },
    });
  }

  /**
   * Resolve LLM config to use for a conversation.
   * Priority: requested provider/model > preferred config
   */
  private async resolveLLMConfig(
    workspaceId: string,
    provider?: string,
    model?: string,
  ): Promise<AgentLLMConfig> {
    let llmConfig: AgentLLMConfig | null = null;

    if (model && provider) {
      llmConfig = await this.llmConfigRepository.findOne({
        where: { workspaceId, provider: provider as LLMProvider },
      });
    }

    if (!llmConfig) {
      llmConfig = await this.getPreferredLLMConfig(workspaceId);
    }

    if (!llmConfig) {
      throw new BadRequestException(
        'No preferred LLM config found. Please create and set a preferred LLM config first.',
      );
    }

    return llmConfig;
  }

  async getModelsForProvider(
    configId: string,
    workspaceId: string,
  ): Promise<ProviderModelDto[]> {
    const config = await this.llmConfigRepository.findOne({
      where: { id: configId, workspaceId },
    });

    if (!config) {
      throw new NotFoundException('LLM config not found');
    }

    const provider = getLLMProviderConfig(config.provider);
    if (!provider) {
      return [];
    }

    const apiKey = decrypt(config.apiKey);
    return provider.fetchModels(apiKey);
  }

  async getConversations(
    workspaceId: string,
    query?: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<ConversationResponseDto>> {
    const qb = this.conversationRepository
      .createQueryBuilder('conversation')
      .where('conversation.workspaceId = :workspaceId', { workspaceId });

    if (query?.search) {
      qb.andWhere('conversation.title ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    const sortBy = query?.sortBy || 'createdAt';
    const sortOrder = query?.sortOrder || 'DESC';
    const page = query?.page || 1;
    const limit = query?.limit || 10;

    qb.orderBy(`conversation.${sortBy}`, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [conversations, total] = await qb.getManyAndCount();

    return getManyResponse({
      query: { ...query, page, limit } as GetManyBaseQueryParams,
      data: conversations.map((c) => ({
        id: c.id,
        llmConfigId: c.llmConfigId,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
    });
  }

  async updateConversation(
    id: string,
    dto: UpdateConversationDto,
    workspaceId: string,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.conversationRepository.findOne({
      where: { id, workspaceId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (dto.title !== undefined) {
      conversation.title = dto.title;
    }

    const saved = await this.conversationRepository.save(conversation);
    return {
      id: saved.id,
      llmConfigId: saved.llmConfigId,
      title: saved.title,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  async deleteConversation(id: string, workspaceId: string): Promise<void> {
    const conversation = await this.conversationRepository.findOne({
      where: { id, workspaceId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    await this.conversationRepository.remove(conversation);
  }

  async deleteAllConversations(workspaceId: string): Promise<void> {
    await this.conversationRepository.delete({ workspaceId });
  }

  async getMessages(
    conversationId: string,
    workspaceId: string,
    query?: GetManyBaseQueryParams,
  ): Promise<MessageResponseDto[]> {
    // Verify conversation belongs to workspace
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, workspaceId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const limit = query?.limit || 50;
    const page = query?.page || 1;

    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      messageType: m.messageType,
      metadata: m.metadata,
      createdAt: m.createdAt,
    }));
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
    workspaceId: string,
  ): Promise<void> {
    // Verify conversation belongs to workspace
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, workspaceId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const message = await this.messageRepository.findOne({
      where: { id: messageId, conversationId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    await this.messageRepository.remove(message);
  }
}
