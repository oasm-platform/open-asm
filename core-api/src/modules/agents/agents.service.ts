import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { decrypt, encrypt } from '@/common/utils/encryption.util';
import { RedisService } from '@/services/redis/redis.service';
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
import { AgentsMemoriesService } from './agents.memories';
import {
  CreateLLMConfigDto,
  LLMConfigResponseDto,
  LLMConfigWithProviderDto,
  LLMProviderStatusDto,
  ProviderModelDto,
  UpdateLLMConfigDto,
} from './dto/llm-config.dto';
import {
  MCPConfigResponseDto,
  MCPServerConfigDto,
  MCPServerPingResponseDto,
  MCPServerResponseDto,
} from './dto/mcp-config.dto';
import { MessageResponseDto } from './dto/message.dto';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMCPConfig } from './entities/agent-mcp-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import {
  getLLMProviderConfig,
  llmProviderSupported,
} from './llm-provider-supported';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    @InjectRepository(AgentLLMConfig)
    private readonly llmConfigRepository: Repository<AgentLLMConfig>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,
    @InjectRepository(AgentMCPConfig)
    private readonly mcpConfigRepository: Repository<AgentMCPConfig>,
    private readonly redisService: RedisService,
    private readonly agentsMemories: AgentsMemoriesService,
  ) {}

  private maskApiKey(apiKey: string): string {
    if (apiKey.length <= 4) return '****';
    return '*'.repeat(apiKey.length - 4) + apiKey.slice(-4);
  }

  private toLLMConfigResponse(config: AgentLLMConfig): LLMConfigResponseDto {
    const apiKeyMasked = config.apiKey
      ? this.maskApiKey(decrypt(config.apiKey))
      : '****';
    return {
      id: config.id,
      provider: config.provider,
      name: config.name,
      model: config.model,
      apiUrl: config.apiUrl,
      isPreferred: config.isPreferred,
      apiKeyMasked,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  async createLLMConfig(
    dto: CreateLLMConfigDto,
    workspaceId: string,
    userId: string,
  ): Promise<LLMConfigResponseDto> {
    // Validate API key by fetching models
    const provider = getLLMProviderConfig(dto.provider);
    if (!provider) {
      throw new BadRequestException(
        `Provider ${dto.provider} is not supported`,
      );
    }

    const models = await provider.fetchModels(dto.apiKey, dto.apiUrl);

    if (models.length === 0) {
      throw new BadRequestException(
        `Cannot connect to ${provider.name}: invalid API key or unable to reach the provider. Please double-check your API key and try again.`,
      );
    }

    // Use first model from the list as default
    const defaultModel = models[0].id;

    // First config in workspace becomes preferred automatically
    const totalConfigs = await this.llmConfigRepository.count({
      where: { workspaceId },
    });
    const isPreferred = totalConfigs === 0;

    if (!dto.apiKey) {
      dto.apiKey = 'not_set';
    }

    const config = this.llmConfigRepository.create({
      workspaceId,
      provider: dto.provider,
      name: dto.name,
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
    const configs = await this.llmConfigRepository.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });

    const result: LLMConfigWithProviderDto[] = [];

    // One row per connected config
    for (const config of configs) {
      const providerMeta = llmProviderSupported.find((p) => p.id === config.provider);
      const apiKeyMasked = config.apiKey
        ? this.maskApiKey(decrypt(config.apiKey))
        : '****';
      result.push({
        providerId: config.provider,
        providerName: providerMeta?.name ?? config.provider,
        logo: providerMeta?.logo,
        isConnected: true,
        configId: config.id,
        name: config.name,
        model: config.model,
        apiUrl: config.apiUrl,
        isPreferred: config.isPreferred,
        apiKeyMasked,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        isAcceptCustomApiUrl: providerMeta?.isAcceptCustomApiUrl ?? false,
      });
    }

    // One row per provider that has NO configs yet (for the "Connect" UI)
    const connectedProviderIds = new Set(configs.map((c) => c.provider));
    for (const provider of llmProviderSupported) {
      if (!connectedProviderIds.has(provider.id)) {
        result.push({
          providerId: provider.id,
          providerName: provider.name,
          logo: provider.logo,
          isConnected: false,
          isAcceptCustomApiUrl: provider.isAcceptCustomApiUrl ?? false,
        });
      }
    }

    return result;
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

  async getModelsForProvider(
    configId: string,
    workspaceId: string,
  ): Promise<ProviderModelDto[]> {
    const cacheKey = `agents:models:${configId}`;

    // Try to get from cache first
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ProviderModelDto[];
      }
    } catch (error) {
      this.logger.warn(`Failed to read from Redis cache: ${error}`);
    }

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
    const models = await provider.fetchModels(apiKey, config.apiUrl);

    // Cache the result for 1 hour (3600 seconds)
    try {
      await this.redisService.setex(cacheKey, 3600, JSON.stringify(models));
    } catch (error) {
      this.logger.warn(`Failed to cache models in Redis: ${error}`);
    }

    return models;
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
    await this.agentsMemories.stmClear(id);
  }

  async deleteAllConversations(workspaceId: string): Promise<void> {
    const conversations = await this.conversationRepository.find({
      where: { workspaceId },
      select: ['id'],
    });
    await this.conversationRepository.delete({ workspaceId });
    await Promise.all(
      conversations.map((c) => this.agentsMemories.stmClear(c.id)),
    );
  }

  async getMessages(
    conversationId: string,
    workspaceId: string,
    query?: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<MessageResponseDto>> {
    // Verify conversation belongs to workspace
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, workspaceId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const limit = query?.limit || 10;
    const page = query?.page || 1;

    const qb = this.messageRepository
      .createQueryBuilder('message')
      .where('message.conversationId = :conversationId', { conversationId })
      .orderBy('message.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [messages, total] = await qb.getManyAndCount();

    return getManyResponse({
      query: { ...query, page, limit } as GetManyBaseQueryParams,
      data: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        messageType: m.messageType,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
      total,
    });
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

  // ==========================================
  // MCP Config Methods
  // ==========================================

  private async getOrCreateMCPConfig(workspaceId: string): Promise<AgentMCPConfig> {
    let config = await this.mcpConfigRepository.findOne({ where: { workspaceId } });
    if (!config) {
      config = this.mcpConfigRepository.create({
        workspaceId,
        configJson: { mcpServers: {} },
      });
      await this.mcpConfigRepository.save(config);
    }
    return config;
  }

  async getMCPConfig(workspaceId: string): Promise<MCPConfigResponseDto> {
    const config = await this.getOrCreateMCPConfig(workspaceId);
    const servers: MCPServerResponseDto[] = Object.entries(
      config.configJson.mcpServers ?? {},
    ).map(([name, serverConfig]) => ({ name, ...serverConfig }));
    return { servers };
  }

  async upsertMCPServer(
    workspaceId: string,
    name: string,
    dto: MCPServerConfigDto,
  ): Promise<MCPServerResponseDto> {
    const config = await this.getOrCreateMCPConfig(workspaceId);

    const existing = config.configJson.mcpServers[name] ?? {};
    config.configJson.mcpServers[name] = {
      disabled: false,
      timeout: 60,
      allowed_tools: null,
      ...existing,
      ...dto,
    };

    await this.mcpConfigRepository.save(config);
    return { name, ...config.configJson.mcpServers[name] };
  }

  async deleteMCPServer(workspaceId: string, name: string): Promise<void> {
    const config = await this.getOrCreateMCPConfig(workspaceId);
    if (!config.configJson.mcpServers[name]) {
      throw new NotFoundException(`MCP server "${name}" not found`);
    }
    delete config.configJson.mcpServers[name];
    await this.mcpConfigRepository.save(config);
  }

  async toggleMCPServer(
    workspaceId: string,
    name: string,
    disabled: boolean,
  ): Promise<MCPServerResponseDto> {
    const config = await this.getOrCreateMCPConfig(workspaceId);
    if (!config.configJson.mcpServers[name]) {
      throw new NotFoundException(`MCP server "${name}" not found`);
    }
    config.configJson.mcpServers[name].disabled = disabled;
    await this.mcpConfigRepository.save(config);
    return { name, ...config.configJson.mcpServers[name] };
  }

  async pingMCPServer(
    workspaceId: string,
    name: string,
  ): Promise<MCPServerPingResponseDto> {
    const config = await this.getOrCreateMCPConfig(workspaceId);
    const server = config.configJson.mcpServers[name];
    if (!server) {
      throw new NotFoundException(`MCP server "${name}" not found`);
    }

    if (server.disabled) {
      return { status: 'offline' };
    }

    // stdio servers cannot be tested from the API
    if (!server.url) {
      return { status: 'unknown' };
    }

    try {
      const start = Date.now();
      const headers: Record<string, string> = { Accept: 'text/event-stream,*/*' };
      if (server.headers) {
        Object.assign(headers, server.headers);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(server.url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const latency = Date.now() - start;
      // Any HTTP response (even 4xx) means the server is reachable
      return { status: res.status < 500 ? 'online' : 'offline', latency };
    } catch {
      return { status: 'offline' };
    }
  }
}
