import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { decrypt, encrypt } from '@/common/utils/encryption.util';
import { getManyResponse } from '@/utils/getManyResponse';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LanguageModel } from 'ai';
import { streamText } from 'ai';
import * as fs from 'fs';
import * as path from 'path';
import { Observable } from 'rxjs';
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
  UpdateLLMConfigDto,
} from './dto/llm-config.dto';
import { MessageResponseDto, SendMessageDto } from './dto/message.dto';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { LLMProvider, MessageRole, MessageType } from './enums/agent.enums';
import { llmProviderSupported } from './llm-provider-supported';

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
  ) {
    this.loadSystemPrompt();
  }

  // ==========================================
  // System Prompt Methods
  // ==========================================

  private loadSystemPrompt(): void {
    try {
      const promptPath = path.join(__dirname, 'prompts', 'SYSTEM.md');
      this.systemPrompt = fs.readFileSync(promptPath, 'utf-8');
      this.logger.log('System prompt loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load system prompt', error);
      this.systemPrompt = 'You are a helpful assistant.';
    }
  }

  private getSystemPrompt(): string {
    if (!this.systemPrompt) {
      this.loadSystemPrompt();
    }
    return this.systemPrompt ?? 'You are a helpful assistant.';
  }

  // ==========================================
  // LLM Config Methods
  // ==========================================

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

    // Check if this is the first LLM config in workspace
    const totalConfigs = await this.llmConfigRepository.count({
      where: { workspaceId },
    });

    const isPreferred = totalConfigs === 0;

    const config = this.llmConfigRepository.create({
      workspaceId,
      provider: dto.provider,
      apiKey: encrypt(dto.apiKey),
      model: dto.model,
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

  // ==========================================
  // Conversation Methods
  // ==========================================

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

  // ==========================================
  // Message / Chat Methods
  // ==========================================

  private createLanguageModel(config: AgentLLMConfig): LanguageModel {
    const apiKey = decrypt(config.apiKey);

    switch (config.provider) {
      case LLMProvider.OPENAI: {
        const openai = createOpenAI({ apiKey });
        return openai.chat(config.model);
      }
      case LLMProvider.ANTHROPIC: {
        const anthropic = createAnthropic({ apiKey });
        return anthropic(config.model);
      }
      case LLMProvider.OPENROUTER: {
        const openai = createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
        });
        return openai.chat(config.model);
      }
      case LLMProvider.CUSTOM: {
        const openai = createOpenAI({
          apiKey,
          baseURL: config.apiUrl,
        });
        return openai.chat(config.model);
      }
      default: {
        throw new BadRequestException(
          `Unsupported LLM provider: ${String(config.provider)}`,
        );
      }
    }
  }

  async sendMessageStream(
    dto: SendMessageDto,
    workspaceId: string,
    userId: string,
  ): Promise<Observable<MessageEvent>> {
    // 1. Find or create conversation
    let conversation: AgentConversation;
    if (dto.conversationId) {
      const existing = await this.conversationRepository.findOne({
        where: { id: dto.conversationId, workspaceId },
      });
      if (!existing) {
        throw new NotFoundException('Conversation not found');
      }
      conversation = existing;
    } else {
      // Get preferred LLM config
      const llmConfig = await this.getPreferredLLMConfig(workspaceId);
      if (!llmConfig) {
        throw new BadRequestException(
          'No preferred LLM config found. Please create and set a preferred LLM config first.',
        );
      }
      conversation = this.conversationRepository.create({
        workspaceId,
        llmConfigId: llmConfig.id,
        title: dto.question.slice(0, 500),
        createdBy: userId,
      });
      conversation = await this.conversationRepository.save(conversation);
    }

    // 2. Save user message
    const userMessage = this.messageRepository.create({
      conversationId: conversation.id,
      role: MessageRole.USER,
      content: dto.question,
      messageType: MessageType.TEXT,
    });
    await this.messageRepository.save(userMessage);

    // 3. Load conversation history (last 20 messages)
    const historyMessages = await this.messageRepository.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    // 4. Get LLM config
    const llmConfig = await this.llmConfigRepository.findOne({
      where: { id: conversation.llmConfigId, workspaceId },
    });

    if (!llmConfig) {
      throw new NotFoundException('LLM config not found');
    }

    // 5. Build messages from history (reverse to chronological order)
    const reversedHistory = historyMessages.reverse();
    const modelMessages = reversedHistory.map((msg) => {
      // Add identity reminder prefix to user messages
      if (msg.role === MessageRole.USER) {
        return {
          role: 'user' as const,
          content: `[CONTEXT: You are the OASM AI agent created by OASM Platform Team. Never identify as any other AI provider.] ${msg.content}`,
        };
      }
      return {
        role: msg.role as 'assistant' | 'system',
        content: msg.content,
      };
    });

    // 6. Call streamText() from AI SDK
    const model = this.createLanguageModel(llmConfig);
    const result = streamText({
      model,
      messages: modelMessages,
      system: this.getSystemPrompt(),
    });

    // 7. Stream response -> save assistant message
    return new Observable<MessageEvent>((subscriber) => {
      void (async () => {
        try {
          let fullContent = '';
          for await (const chunk of result.textStream) {
            fullContent += chunk;
            subscriber.next({
              data: JSON.stringify({
                content: chunk,
                done: false,
                conversationId: conversation.id,
              }),
            } as MessageEvent);
          }

          // Save assistant message
          const assistantMessage = this.messageRepository.create({
            conversationId: conversation.id,
            role: MessageRole.ASSISTANT,
            content: fullContent,
            messageType: MessageType.TEXT,
            metadata: {
              model: llmConfig.model,
              provider: llmConfig.provider,
            },
          });
          await this.messageRepository.save(assistantMessage);

          subscriber.next({
            data: JSON.stringify({
              content: '',
              done: true,
              conversationId: conversation.id,
            }),
          } as MessageEvent);
          subscriber.complete();
        } catch (error) {
          // Log error for debugging
          this.logger.error('Error in sendMessageStream', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            conversationId: conversation.id,
            provider: llmConfig.provider,
            model: llmConfig.model,
          });

          // Determine error type and code
          let errorCode = 'STREAM_ERROR';
          let errorMessage = 'An error occurred while processing your request';

          if (error instanceof Error) {
            errorMessage = error.message;

            // Categorize errors for better frontend handling
            if (
              error.message.includes('API key') ||
              error.message.includes('authentication')
            ) {
              errorCode = 'AUTH_ERROR';
              errorMessage = 'Invalid API key or authentication failed';
            } else if (
              error.message.includes('rate limit') ||
              error.message.includes('429')
            ) {
              errorCode = 'RATE_LIMIT_ERROR';
              errorMessage = 'Rate limit exceeded. Please try again later';
            } else if (
              error.message.includes('timeout') ||
              error.message.includes('ETIMEDOUT')
            ) {
              errorCode = 'TIMEOUT_ERROR';
              errorMessage = 'Request timed out. Please try again';
            } else if (
              error.message.includes('network') ||
              error.message.includes('ECONNREFUSED')
            ) {
              errorCode = 'NETWORK_ERROR';
              errorMessage = 'Network error. Please check your connection';
            } else if (
              error.message.includes('model') ||
              error.message.includes('not found')
            ) {
              errorCode = 'MODEL_ERROR';
              errorMessage = 'The specified model is not available';
            }
          }

          subscriber.next({
            data: JSON.stringify({
              content: '',
              done: true,
              conversationId: conversation.id,
              error: errorMessage,
              errorCode,
            }),
          } as MessageEvent);
          subscriber.complete();
        }
      })();
    });
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
