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
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
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
import { AgentEmbeddingConfig } from './entities/agent-embedding.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMCPConfig } from './entities/agent-mcp-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentSkill } from './entities/agent-skill.entity';
import {
  getLLMProviderConfig,
  llmProviderSupported,
  getEmbeddingModel,
} from './agents.llm';
import {
  embeddingProviderSupported,
  getEmbeddingProviderConfig,
} from './agents.embedding';
import * as matter from 'gray-matter';
import { embed } from 'ai';
import { UpsertSkillDto, SkillResponseDto } from './dto/skill.dto';
import {
  CreateEmbeddingConfigDto,
  EmbeddingConfigResponseDto,
  EmbeddingModelInfoDto,
  EmbeddingProviderStatusDto,
  UpdateEmbeddingConfigDto,
} from './dto/embedding-config.dto';
import { EmbeddingProvider, SkillStatus } from './enums/agent.enums';

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
    @InjectRepository(AgentSkill)
    private readonly skillRepository: Repository<AgentSkill>,
    @InjectRepository(AgentEmbeddingConfig)
    private readonly embeddingConfigRepository: Repository<AgentEmbeddingConfig>,
    private readonly redisService: RedisService,
    private readonly agentsMemories: AgentsMemoriesService,
    private readonly httpService: HttpService,
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
      const providerMeta = llmProviderSupported.find(
        (p) => p.id === config.provider,
      );
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

  private assertSafeMCPServerName(name: string): void {
    if (
      name === '__proto__' ||
      name === 'constructor' ||
      name === 'prototype'
    ) {
      throw new BadRequestException('Invalid MCP server name');
    }
  }

  private isSafeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // Block common private/internal addresses (allowing localhost for local MCP servers)
      if (
        hostname === '169.254.169.254' || // AWS/Cloud metadata
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.')
      ) {
        return false;
      }

      // More thorough private IP check for 172.16.0.0/12
      if (hostname.startsWith('172.')) {
        const parts = hostname.split('.');
        if (parts.length === 4) {
          const secondPart = parseInt(parts[1], 10);
          if (secondPart >= 16 && secondPart <= 31) {
            return false;
          }
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  private async getOrCreateMCPConfig(
    workspaceId: string,
  ): Promise<AgentMCPConfig> {
    let config = await this.mcpConfigRepository.findOne({
      where: { workspaceId },
    });
    if (!config) {
      try {
        config = this.mcpConfigRepository.create({
          workspaceId,
          configJson: { mcpServers: {} },
        });
        config = await this.mcpConfigRepository.save(config);
      } catch (e) {
        // Handle race condition: if another request created it, find it
        config = await this.mcpConfigRepository.findOne({
          where: { workspaceId },
        });
        if (!config) throw e;
      }
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
    this.assertSafeMCPServerName(name);
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
    this.assertSafeMCPServerName(name);
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
    this.assertSafeMCPServerName(name);
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
    this.assertSafeMCPServerName(name);
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

    if (!this.isSafeUrl(server.url)) {
      this.logger.warn(
        `Blocked potentially unsafe MCP ping URL: ${server.url}`,
      );
      return { status: 'offline' };
    }

    try {
      const start = Date.now();
      const headers: Record<string, string> = {
        Accept: 'text/event-stream,*/*',
      };
      if (server.headers) {
        Object.assign(headers, server.headers);
      }

      const res = await firstValueFrom(
        this.httpService.get(server.url, {
          headers,
          timeout: 5000,
          validateStatus: () => true, // Don't throw for non-2xx status
        }),
      );

      const latency = Date.now() - start;
      // Any HTTP response (even 4xx) means the server is reachable
      return { status: res.status < 500 ? 'online' : 'offline', latency };
    } catch {
      return { status: 'offline' };
    }
  }

  async upsertSkill(
    workspaceId: string,
    dto: UpsertSkillDto,
  ): Promise<SkillResponseDto> {
    const { markdown } = dto;
    const { data, content } = matter(markdown) as unknown as {
      data: Record<string, unknown>;
      content: string;
    };

    const title = ((data.title ?? data.name) as string) || 'Untitled Skill';

    let embeddingString: string | null = null;
    try {
      const config = await this.getPreferredLLMConfig(workspaceId);
      if (config) {
        const embeddingModel = getEmbeddingModel(config);
        if (embeddingModel) {
          const { embedding } = await embed({
            model: embeddingModel,
            value: content,
          });
          embeddingString = JSON.stringify(embedding);
        }
      }
    } catch (e) {
      this.logger.warn(
        `Failed to generate embedding for skill ${title}: ${(e as Error).message}`,
      );
    }

    let skill = await this.skillRepository.findOne({
      where: { title, workspaceId },
    });

    if (!skill) {
      skill = this.skillRepository.create({
        workspaceId,
        title,
        description: content,
        embedding: embeddingString,
      });
    } else {
      skill.description = content;
      if (embeddingString) {
        skill.embedding = embeddingString;
      }
    }

    const saved = await this.skillRepository.save(skill);
    return this.mapSkillToResponse(saved);
  }

  async getSkills(workspaceId: string): Promise<SkillResponseDto[]> {
    const skills = await this.skillRepository.find({
      where: { workspaceId },
      order: { updatedAt: 'DESC' },
    });
    return skills.map((s) => this.mapSkillToResponse(s));
  }

  async getSkill(id: string, workspaceId: string): Promise<SkillResponseDto> {
    const skill = await this.skillRepository.findOne({
      where: { id, workspaceId },
    });
    if (!skill) throw new NotFoundException('Skill not found');
    return this.mapSkillToResponse(skill);
  }

  async deleteSkill(id: string, workspaceId: string): Promise<void> {
    const skill = await this.skillRepository.findOne({
      where: { id, workspaceId },
    });
    if (!skill) throw new NotFoundException('Skill not found');
    await this.skillRepository.remove(skill);
  }

  async toggleSkillStatus(
    id: string,
    workspaceId: string,
  ): Promise<SkillResponseDto> {
    const skill = await this.skillRepository.findOne({
      where: { id, workspaceId },
    });
    if (!skill) throw new NotFoundException('Skill not found');
    skill.status =
      skill.status === SkillStatus.ACTIVE
        ? SkillStatus.INACTIVE
        : SkillStatus.ACTIVE;
    const saved = await this.skillRepository.save(skill);
    return this.mapSkillToResponse(saved);
  }

  async findRelevantSkills(
    workspaceId: string,
    text: string,
    limit = 5,
  ): Promise<SkillResponseDto[]> {
    try {
      const config = await this.getPreferredLLMConfig(workspaceId);
      if (!config) {
        return this.getSkills(workspaceId); // Fallback to recent skills if no config
      }

      const embeddingModel = getEmbeddingModel(config);
      if (!embeddingModel) {
        return this.getSkills(workspaceId);
      }

      const { embedding } = await embed({
        model: embeddingModel,
        value: text,
      });

      const vector = JSON.stringify(embedding);

      // Cast text→vector for pgvector cosine similarity (embedding stored as JSON array string)
      const skills = await this.skillRepository
        .createQueryBuilder('skill')
        .where('skill.workspaceId = :workspaceId', { workspaceId })
        .andWhere('skill.embedding IS NOT NULL')
        .orderBy(`skill.embedding::vector <=> :vector::vector`, 'ASC')
        .setParameters({ vector })
        .limit(limit)
        .getMany();

      return skills.map((s) => this.mapSkillToResponse(s));
    } catch (e) {
      this.logger.error(
        `Failed to find relevant skills: ${(e as Error).message}`,
      );
      return [];
    }
  }

  private mapSkillToResponse(skill: AgentSkill): SkillResponseDto {
    return {
      id: skill.id,
      title: skill.title,
      description: skill.description,
      status: skill.status,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    };
  }

  // ── Embedding Config ──────────────────────────────────────────────────────

  private toEmbeddingConfigResponse(
    config: AgentEmbeddingConfig,
  ): EmbeddingConfigResponseDto {
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

  async getEmbeddingProviders(
    workspaceId: string,
  ): Promise<EmbeddingProviderStatusDto[]> {
    const configs = await this.embeddingConfigRepository.find({
      where: { workspaceId },
    });

    const configMap = new Map<EmbeddingProvider, EmbeddingConfigResponseDto>();
    for (const c of configs) {
      if (!configMap.has(c.provider)) {
        configMap.set(c.provider, this.toEmbeddingConfigResponse(c));
      }
    }

    return embeddingProviderSupported.map((provider) => ({
      id: provider.id,
      name: provider.name,
      logo: provider.logo,
      models: provider.models,
      isAcceptCustomApiUrl: provider.isAcceptCustomApiUrl,
      isConnected: configMap.has(provider.id),
      config: configMap.get(provider.id) ?? null,
    }));
  }

  async getEmbeddingModelsForProvider(
    configId: string,
    workspaceId: string,
  ): Promise<EmbeddingModelInfoDto[]> {
    const cacheKey = `agents:embedding_models:${configId}`;

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as EmbeddingModelInfoDto[];
      }
    } catch (error) {
      this.logger.warn(`Failed to read from Redis cache: ${error}`);
    }

    const config = await this.embeddingConfigRepository.findOne({
      where: { id: configId, workspaceId },
    });

    if (!config) {
      throw new NotFoundException('Embedding config not found');
    }

    const provider = getEmbeddingProviderConfig(config.provider);
    if (!provider) {
      return [];
    }

    let models: EmbeddingModelInfoDto[] = [];
    if (provider.fetchModels) {
      const apiKey = config.apiKey ? decrypt(config.apiKey) : '';
      models = await provider.fetchModels(apiKey, config.apiUrl);
    } else {
      models = provider.models;
    }

    try {
      await this.redisService.setex(cacheKey, 3600, JSON.stringify(models));
    } catch (error) {
      this.logger.warn(`Failed to cache models in Redis: ${error}`);
    }

    return models;
  }

  async createEmbeddingConfig(
    dto: CreateEmbeddingConfigDto,
    workspaceId: string,
    userId: string,
  ): Promise<EmbeddingConfigResponseDto> {
    const provider = getEmbeddingProviderConfig(dto.provider);
    if (!provider) {
      throw new BadRequestException(
        `Provider ${dto.provider} is not supported`,
      );
    }

    let defaultModel = '';
    if (provider.fetchModels) {
      const models = await provider.fetchModels(dto.apiKey, dto.apiUrl);
      if (models.length === 0) {
        throw new BadRequestException(
          `Cannot connect to ${provider.name}: invalid API key or unable to reach the provider.`,
        );
      }
      defaultModel = models[0].id;
    } else {
      defaultModel = provider.models[0]?.id ?? '';
    }

    const totalConfigs = await this.embeddingConfigRepository.count({
      where: { workspaceId },
    });
    const isPreferred = totalConfigs === 0;

    if (!dto.apiKey) {
      dto.apiKey = 'not_set';
    }

    const config = this.embeddingConfigRepository.create({
      workspaceId,
      provider: dto.provider,
      name: dto.name,
      apiKey: encrypt(dto.apiKey),
      model: dto.model || defaultModel,
      apiUrl: dto.apiUrl,
      createdBy: userId,
      isPreferred,
    });

    const saved = await this.embeddingConfigRepository.save(config);
    return this.toEmbeddingConfigResponse(saved);
  }

  async updateEmbeddingConfig(
    id: string,
    dto: UpdateEmbeddingConfigDto,
    workspaceId: string,
  ): Promise<EmbeddingConfigResponseDto> {
    const config = await this.embeddingConfigRepository.findOne({
      where: { id, workspaceId },
    });
    if (!config) throw new NotFoundException('Embedding config not found');

    if (dto.provider !== undefined) config.provider = dto.provider;
    if (dto.name !== undefined) config.name = dto.name;
    if (dto.apiKey !== undefined) config.apiKey = encrypt(dto.apiKey);
    if (dto.model !== undefined) config.model = dto.model;
    if (dto.apiUrl !== undefined) config.apiUrl = dto.apiUrl;
    if (dto.isPreferred !== undefined) config.isPreferred = dto.isPreferred;

    const saved = await this.embeddingConfigRepository.save(config);
    return this.toEmbeddingConfigResponse(saved);
  }

  async deleteEmbeddingConfig(id: string, workspaceId: string): Promise<void> {
    const config = await this.embeddingConfigRepository.findOne({
      where: { id, workspaceId },
    });
    if (!config) throw new NotFoundException('Embedding config not found');
    await this.embeddingConfigRepository.remove(config);
  }

  async setPreferredEmbeddingConfig(
    id: string,
    workspaceId: string,
  ): Promise<EmbeddingConfigResponseDto> {
    const config = await this.embeddingConfigRepository.findOne({
      where: { id, workspaceId },
    });
    if (!config) throw new NotFoundException('Embedding config not found');

    await this.embeddingConfigRepository.update(
      { workspaceId },
      { isPreferred: false },
    );
    config.isPreferred = true;
    const saved = await this.embeddingConfigRepository.save(config);
    return this.toEmbeddingConfigResponse(saved);
  }
}
