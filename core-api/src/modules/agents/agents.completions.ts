import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LanguageModel, UIMessageChunk } from 'ai';
import { stepCountIs, streamText } from 'ai';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';

import { decrypt } from '@/common/utils/encryption.util';
import { AgentTool } from './agents.tools';
import { SendMessageDto } from './dto/message.dto';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { LLMProvider, MessageRole, MessageType } from './enums/agent.enums';
import { getLLMProviderConfig } from './llm-provider-supported';

export interface StreamMessageResult {
  stream: ReadableStream<UIMessageChunk>;
  conversationId: string;
}

@Injectable()
export class AgentsCompletionsService {
  private readonly logger = new Logger(AgentsCompletionsService.name);
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

  private async getPreferredLLMConfig(
    workspaceId: string,
  ): Promise<AgentLLMConfig | null> {
    return this.llmConfigRepository.findOne({
      where: { workspaceId, isPreferred: true },
    });
  }

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

  private createLanguageModel(config: AgentLLMConfig): LanguageModel {
    const apiKey = decrypt(config.apiKey);
    const providerConfig = getLLMProviderConfig(config.provider);

    if (!providerConfig) {
      throw new BadRequestException(
        `Unsupported LLM provider: ${String(config.provider)}`,
      );
    }

    const baseURL =
      config.provider === LLMProvider.CUSTOM ? config.apiUrl : undefined;

    return providerConfig.handler(apiKey, config.model, baseURL);
  }

  async streamMessage(
    dto: SendMessageDto,
    workspaceId: string,
    userId: string,
  ): Promise<StreamMessageResult> {
    let conversation: AgentConversation;
    if (dto.conversationId) {
      const existing = await this.conversationRepository.findOne({
        where: { id: dto.conversationId, workspaceId },
      });
      if (existing) {
        conversation = existing;
      } else {
        const llmConfig = await this.resolveLLMConfig(
          workspaceId,
          dto.provider,
          dto.model,
        );
        conversation = this.conversationRepository.create({
          id: dto.conversationId,
          workspaceId,
          llmConfigId: llmConfig.id,
          title: dto.question.slice(0, 500),
          createdBy: userId,
        });
        conversation = await this.conversationRepository.save(conversation);
      }
    } else {
      const llmConfig = await this.resolveLLMConfig(
        workspaceId,
        dto.provider,
        dto.model,
      );
      conversation = this.conversationRepository.create({
        workspaceId,
        llmConfigId: llmConfig.id,
        title: dto.question.slice(0, 500),
        createdBy: userId,
      });
      conversation = await this.conversationRepository.save(conversation);
    }

    const userMessage = this.messageRepository.create({
      conversationId: conversation.id,
      role: MessageRole.USER,
      content: dto.question,
      messageType: MessageType.TEXT,
    });
    await this.messageRepository.save(userMessage);

    const historyMessages = await this.messageRepository.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    let llmConfig = await this.llmConfigRepository.findOne({
      where: { id: conversation.llmConfigId, workspaceId },
    });

    if (!llmConfig) {
      throw new NotFoundException('LLM config not found');
    }

    if (dto.model && dto.provider === llmConfig.provider) {
      llmConfig = this.llmConfigRepository.create({
        ...llmConfig,
        model: dto.model,
      });
    }

    const reversedHistory = historyMessages.reverse();
    const modelMessages = reversedHistory.map((msg) => {
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

    const model = this.createLanguageModel(llmConfig);

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
    await this.messageRepository.save(assistantMessage);

    const conversationIdStr = conversation.id;
    const messageRepo = this.messageRepository;
    const assistantMsgId = assistantMessage.id;
    const assistantMsgMetadata = assistantMessage.metadata;
    const tools = this.agentTool.getTools(workspaceId);
    const systemPrompt = this.getSystemPrompt();

    let accumulatedText = '';

    const now = new Date();
    const currentTimeContext = `Current time: ${now.toISOString()} (${now.toLocaleString('en-US', { timeZoneName: 'short' })})`;

    const result = streamText({
      model,
      messages: [
        {
          role: 'system' as const,
          content: currentTimeContext,
        },
        ...modelMessages,
      ],
      system: systemPrompt,
      tools,
      stopWhen: stepCountIs(10),
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          accumulatedText += chunk.text;
        }
      },
      onFinish: async () => {
        if (accumulatedText) {
          await messageRepo.update(
            { id: assistantMsgId },
            {
              content: accumulatedText,
              metadata: {
                ...assistantMsgMetadata,
                status: 'completed',
              },
            },
          );
        }
      },
    });

    const wrappedStream = result.toUIMessageStream().pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: 'data-conversation-created',
            data: {
              conversationId: conversationIdStr,
            },
          } as UIMessageChunk);
        },
      }),
    );

    return {
      stream: wrappedStream,
      conversationId: conversation.id,
    };
  }
}
