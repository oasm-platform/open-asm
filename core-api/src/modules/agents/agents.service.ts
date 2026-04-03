import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { decrypt, encrypt } from '@/common/utils/encryption.util';
import { getManyResponse } from '@/utils/getManyResponse';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LanguageModel, TextStreamPart, ToolSet } from 'ai';
import { streamText } from 'ai';
import * as fs from 'fs';
import * as path from 'path';
import { Observable } from 'rxjs';
import { Repository } from 'typeorm';
import { AgentTool } from './agents.tools';
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
    private readonly agentTool: AgentTool,
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

    const apiKey = decrypt(config.apiKey);

    switch (config.provider) {
      case LLMProvider.OPENAI:
        return this.fetchOpenAIModels(apiKey);
      case LLMProvider.ANTHROPIC:
        return this.getAnthropicModels();
      case LLMProvider.OPENROUTER:
        return this.fetchOpenRouterModels();
      case LLMProvider.GEMINI:
        return this.fetchGeminiModels(apiKey);
      case LLMProvider.CUSTOM:
        return [];
      default:
        return [];
    }
  }

  private async fetchOpenAIModels(
    apiKey: string,
  ): Promise<ProviderModelDto[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        this.logger.warn(
          `OpenAI models fetch failed: ${response.status}`,
        );
        return [];
      }

      const data = (await response.json()) as {
        data: Array<{ id: string }>;
      };

      return data.data
        .filter(
          (m) =>
            m.id.startsWith('gpt-') ||
            m.id.startsWith('o1') ||
            m.id.startsWith('o3') ||
            m.id.startsWith('o4'),
        )
        .map((m) => ({ id: m.id, name: m.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      this.logger.error('Failed to fetch OpenAI models', error);
      return [];
    }
  }

  private getAnthropicModels(): ProviderModelDto[] {
    const models = [
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-haiku-4-5-20251001',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
    return models.map((id) => ({ id, name: id }));
  }

  private async fetchOpenRouterModels(): Promise<ProviderModelDto[]> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');

      if (!response.ok) {
        this.logger.warn(
          `OpenRouter models fetch failed: ${response.status}`,
        );
        return [];
      }

      const data = (await response.json()) as {
        data: Array<{ id: string; name?: string }>;
      };

      return data.data
        .map((m) => ({ id: m.id, name: m.name ?? m.id }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      this.logger.error('Failed to fetch OpenRouter models', error);
      return [];
    }
  }

  private async fetchGeminiModels(
    apiKey: string,
  ): Promise<ProviderModelDto[]> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );

      if (!response.ok) {
        this.logger.warn(
          `Gemini models fetch failed: ${response.status}`,
        );
        return [];
      }

      const data = (await response.json()) as {
        models: Array<{ name: string; displayName?: string }>;
      };

      return data.models
        .filter((m) => m.name.startsWith('models/gemini'))
        .map((m) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName ?? m.name.replace('models/', ''),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      this.logger.error('Failed to fetch Gemini models', error);
      return [];
    }
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

  async deleteAllConversations(workspaceId: string): Promise<void> {
    await this.conversationRepository.delete({ workspaceId });
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
      case LLMProvider.GEMINI: {
        const google = createGoogleGenerativeAI({ apiKey });
        return google.chat(config.model);
      }
      case LLMProvider.OPENROUTER: {
        const openai = createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
        });
        return openai.chat(config.model);
      }
      case LLMProvider.KILO_CODE: {
        const kilo = createOpenAI({
          apiKey,
          baseURL: 'https://api.kilo.ai/api/gateway',
        });
        return kilo.chat(config.model);
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
      // Determine which LLM config to use
      let llmConfig: AgentLLMConfig | null = null;

      if (dto.model && dto.provider) {
        // Find config matching the requested provider
        llmConfig = await this.llmConfigRepository.findOne({
          where: { workspaceId, provider: dto.provider as LLMProvider },
        });
      }

      // Fall back to preferred config
      if (!llmConfig) {
        llmConfig = await this.getPreferredLLMConfig(workspaceId);
      }

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
    let llmConfig = await this.llmConfigRepository.findOne({
      where: { id: conversation.llmConfigId, workspaceId },
    });

    if (!llmConfig) {
      throw new NotFoundException('LLM config not found');
    }

    // Apply model override if provided (only affects this request)
    if (dto.model && dto.provider === llmConfig.provider) {
      llmConfig = { ...llmConfig, model: dto.model } as AgentLLMConfig;
    }

    // 5. Build messages from history (reverse to chronological order)
    const reversedHistory = historyMessages.reverse();
    const modelMessages = reversedHistory.map((msg) => {
      // Add identity reminder prefix to user messages
      if (msg.role === MessageRole.USER) {
        return {
          role: 'user' as const,
          content: `[CONTEXT: You are the Security Agent created by OASM Platform Team. Never identify as any other AI provider.] ${msg.content}`,
        };
      }
      return {
        role: msg.role as 'assistant' | 'system',
        content: msg.content,
      };
    });

    // 6. Create language model
    const model = this.createLanguageModel(llmConfig);

    // 7. Create placeholder assistant message immediately (always saved)
    const assistantMessage = this.messageRepository.create({
      conversationId: conversation.id,
      role: MessageRole.ASSISTANT,
      content: '',
      messageType: MessageType.TEXT,
      metadata: {
        model: llmConfig.model,
        provider: llmConfig.provider,
        status: 'streaming',
      },
    });
    const savedAssistantMessage = await this.messageRepository.save(assistantMessage);
    const assistantMessageId = savedAssistantMessage.id;

    // 8. Stream response -> update assistant message
    return new Observable<MessageEvent>((subscriber) => {
      // Send conversationId and messageId first
      subscriber.next({
        data: JSON.stringify({
          type: 'init',
          conversationId: conversation.id,
          messageId: assistantMessageId,
          done: false,
        }),
      } as MessageEvent);

      void (async () => {
        let fullContent = '';
        const toolCalls: Array<{id: string; name: string; input: unknown}> = [];

        try {
          let streamError: unknown = null;

          const result = streamText({
            model,
            messages: modelMessages,
            system: this.getSystemPrompt(),
            tools: this.agentTool.getTools(workspaceId),
            onError: (error) => {
              streamError = error.error;
            },
          });

          for await (const chunk of result.fullStream) {
            const typedChunk = chunk as TextStreamPart<ToolSet>;

            switch (typedChunk.type) {
              case 'text-delta':
                fullContent += typedChunk.text;
                subscriber.next({
                  data: JSON.stringify({
                    type: 'text',
                    content: typedChunk.text,
                    done: false,
                    conversationId: conversation.id,
                  }),
                } as MessageEvent);
                break;

              case 'tool-input-start':
                subscriber.next({
                  data: JSON.stringify({
                    type: 'tool-call-start',
                    toolCallId: typedChunk.id,
                    toolName: typedChunk.toolName,
                    done: false,
                    conversationId: conversation.id,
                  }),
                } as MessageEvent);
                break;

              case 'tool-input-delta':
                subscriber.next({
                  data: JSON.stringify({
                    type: 'tool-call-delta',
                    toolCallId: typedChunk.id,
                    argsTextDelta: typedChunk.delta,
                    done: false,
                    conversationId: conversation.id,
                  }),
                } as MessageEvent);
                break;

              case 'tool-call':
                toolCalls.push({
                  id: typedChunk.toolCallId,
                  name: typedChunk.toolName,
                  input: typedChunk.input as Record<string, unknown>,
                });
                subscriber.next({
                  data: JSON.stringify({
                    type: 'tool-call',
                    toolCallId: typedChunk.toolCallId,
                    toolName: typedChunk.toolName,
                    input: typedChunk.input as Record<string, unknown>,
                    done: false,
                    conversationId: conversation.id,
                  }),
                } as MessageEvent);
                break;

              case 'error': {
                const chunkError = typedChunk as unknown as Record<string, unknown>;
                const errorObj = chunkError.error;

                // Extract full API response body if available
                let fullApiError: Record<string, unknown> | null = null;
                if (errorObj && typeof errorObj === 'object') {
                  const apiError = errorObj as Record<string, unknown>;
                  if (apiError.responseBody && typeof apiError.responseBody === 'string') {
                    try {
                      fullApiError = JSON.parse(apiError.responseBody) as Record<string, unknown>;
                    } catch {
                      // responseBody is not valid JSON
                    }
                  }
                }

                const errorMsg = fullApiError
                  ? JSON.stringify(fullApiError)
                  : ((errorObj as Error)?.message ?? (typeof errorObj === 'string' ? errorObj : 'Unknown stream error'));

                throw new Error(errorMsg);
              }

              default:
                this.logger.debug(`Unknown stream chunk type: ${typedChunk.type}`, JSON.stringify(typedChunk).slice(0, 200));
                break;
            }
          }

          // Check if onError captured an error
          if (streamError) {
            throw new Error(typeof streamError === 'string' ? streamError : (streamError as Error)?.message ?? 'Unknown error');
          }

          // Build content with tool calls included
          const messageContent = toolCalls.length > 0
            ? JSON.stringify({ text: fullContent, toolCalls })
            : fullContent;

          // Update assistant message with final content
          await this.messageRepository.update(assistantMessageId, {
            content: messageContent,
            metadata: {
              model: llmConfig.model,
              provider: llmConfig.provider,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              status: 'completed',
            },
          });

          subscriber.next({
            data: JSON.stringify({
              type: 'finish',
              content: messageContent,
              done: true,
              conversationId: conversation.id,
              messageId: assistantMessageId,
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
          let rawApiResponse: Record<string, unknown> | null = null;

          if (error instanceof Error) {
            const apiError = error as unknown as Record<string, unknown>;

            // Try to extract full API response body first
            if (apiError.responseBody && typeof apiError.responseBody === 'string') {
              try {
                rawApiResponse = JSON.parse(apiError.responseBody) as Record<string, unknown>;
                // Use the full raw API response as error message
                errorMessage = JSON.stringify(rawApiResponse, null, 2);
              } catch {
                // responseBody is not valid JSON, fall back to error.message
                errorMessage = error.message;
              }
            } else {
              errorMessage = error.message;
            }

            // Categorize errors for better frontend handling
            if (
              error.message.includes('API key') ||
              error.message.includes('authentication')
            ) {
              errorCode = 'AUTH_ERROR';
            } else if (
              error.message.includes('rate limit') ||
              error.message.includes('429')
            ) {
              errorCode = 'RATE_LIMIT_ERROR';
            } else if (
              error.message.includes('timeout') ||
              error.message.includes('ETIMEDOUT')
            ) {
              errorCode = 'TIMEOUT_ERROR';
            } else if (
              error.message.includes('network') ||
              error.message.includes('ECONNREFUSED')
            ) {
              errorCode = 'NETWORK_ERROR';
            } else if (
              error.message.includes('model') ||
              error.message.includes('not found') ||
              apiError.statusCode === 404
            ) {
              errorCode = 'MODEL_ERROR';
            }
          }

          // Build error content - use API error message directly
          const errorMessageContent = toolCalls.length > 0
            ? JSON.stringify({ text: fullContent, toolCalls, error: errorMessage })
            : errorMessage;

          // Update assistant message with error (always saved)
          await this.messageRepository.update(assistantMessageId, {
            content: errorMessageContent,
            metadata: {
              model: llmConfig.model,
              provider: llmConfig.provider,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              status: 'error',
              error: errorMessage,
              errorCode,
            },
          });

          subscriber.next({
            data: JSON.stringify({
              type: 'error',
              content: errorMessageContent,
              done: true,
              conversationId: conversation.id,
              messageId: assistantMessageId,
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
