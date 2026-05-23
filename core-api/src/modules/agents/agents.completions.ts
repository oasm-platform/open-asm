import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LanguageModel, UIMessageChunk } from 'ai';
import { generateText, stepCountIs, streamText } from 'ai';
import * as fs from 'fs';
import * as Mustache from 'mustache';
import { EventEmitter } from 'node:events';
import * as path from 'path';
import { Repository } from 'typeorm';

import { AgentMode } from '@/common/enums/enum';
import { decrypt } from '@/common/utils/encryption.util';
import { AgentsMcpService } from './agents.mcp';
import { AgentsMemoriesService } from './agents.memories';
import { AgentTool } from './agents.tools';
import { SendMessageDto } from './dto/message.dto';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { LLMProvider, MessageRole, MessageType } from './enums/agent.enums';
import { getLLMProviderConfig } from './llm-provider-supported';
import type { AgentTodoItem } from './agents.todo';
import { formatTodosToPrompt } from './agents.todo';

export interface StreamMessageResult {
  stream: ReadableStream<UIMessageChunk>;
  conversationId: string;
}

@Injectable()
export class AgentsCompletionsService {
  private readonly logger = new Logger(AgentsCompletionsService.name);
  private readonly prompts = new Map<string, string>();
  private readonly defaultPrompts: Record<string, string> = {
    'SYSTEM.md': 'You are a helpful assistant.',
    'TITLE_GENERATE.md': 'Generate a short title for this conversation.',
    'VUL_ANALYZE.md': 'You are a security expert analyzing vulnerabilities.',
  };
  private static readonly PROMPTS_DIR = 'prompts';
  private readonly toolCapableModelsCache = new Map<string, Set<string>>();
  private toolCapableCacheExpiry = 0;
  private static readonly TOOL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  // Cache for custom/Ollama model tool support: key = `${baseURL}:${model}`, value = boolean
  private readonly customToolSupportCache = new Map<string, boolean>();

  constructor(
    @InjectRepository(AgentLLMConfig)
    private readonly llmConfigRepository: Repository<AgentLLMConfig>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,
    private readonly agentTool: AgentTool,
    private readonly agentsMemories: AgentsMemoriesService,
    private readonly agentsMcpService: AgentsMcpService,
  ) {
    this.loadAllPrompts();
  }

  /**
   * Loads all prompt files from the prompts directory at startup.
   */
  private loadAllPrompts(): void {
    const promptsDir = path.join(
      __dirname,
      AgentsCompletionsService.PROMPTS_DIR,
    );
    try {
      const files = fs.readdirSync(promptsDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          this.loadPrompt(file);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load prompts directory', error);
      this.loadPrompt('SYSTEM.md');
    }
  }

  /**
   * Loads a prompt from file system and caches it in memory.
   * Falls back to default prompt if file not found or read error occurs.
   */
  private loadPrompt(fileName: string): void {
    try {
      const promptPath = path.join(__dirname, 'prompts', fileName);
      this.prompts.set(fileName, fs.readFileSync(promptPath, 'utf-8'));
    } catch (error) {
      this.logger.error(`Failed to load prompt: ${fileName}`, error);
      this.prompts.set(fileName, this.defaultPrompts[fileName] ?? '');
    }
  }

  /**
   * Retrieves a prompt by filename and renders it with Mustache.
   * Returns the default prompt as fallback if loading fails.
   */
  private getPrompt(fileName: string, data?: Record<string, unknown>): string {
    const template =
      this.prompts.get(fileName) ?? this.defaultPrompts[fileName] ?? '';
    if (data) {
      return Mustache.render(template, data);
    }
    return template;
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

  /**
   * Validates that the model supports tool calling for providers that require it.
   * Uses an in-memory cache (10 min TTL) to avoid repeated API calls per message.
   * Throws BadRequestException BEFORE the stream starts so the caller can still
   * return a proper HTTP 400 response.
   */
  private async validateToolSupport(config: AgentLLMConfig): Promise<void> {
    if (config.provider !== LLMProvider.OPENROUTER) {
      return;
    }

    const now = Date.now();
    let toolModels = this.toolCapableModelsCache.get('openrouter');

    if (!toolModels || now > this.toolCapableCacheExpiry) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        if (response.ok) {
          const data = (await response.json()) as {
            data: Array<{ id: string; supported_parameters?: string[] }>;
          };
          toolModels = new Set(
            data.data
              .filter((m) => m.supported_parameters?.includes('tools'))
              .map((m) => m.id),
          );
          this.toolCapableModelsCache.set('openrouter', toolModels);
          this.toolCapableCacheExpiry =
            now + AgentsCompletionsService.TOOL_CACHE_TTL_MS;
        }
      } catch (err) {
        this.logger.warn('Failed to fetch OpenRouter model capabilities', err);
        return; // Assume capable if check fails
      }
    }

    if (toolModels && !toolModels.has(config.model)) {
      throw new BadRequestException(
        `The selected model "${config.model}" does not support tool calling. ` +
          'Please switch to a model that supports tools (e.g. gpt-4o, claude-3-5-sonnet, gemini-2.0-flash).',
      );
    }
  }

  private createLanguageModel(config: AgentLLMConfig): LanguageModel {
    const apiKey = config.apiKey ? decrypt(config.apiKey) : '';
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

  private async generateTitle(
    conversationId: string,
    llmConfig: AgentLLMConfig,
  ): Promise<void> {
    try {
      const messages = await this.messageRepository.find({
        where: { conversationId },
        order: { createdAt: 'ASC' },
        take: 2,
      });

      if (messages.length < 2) {
        return;
      }

      const conversationContent = messages
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n\n');

      const prompt = this.getPrompt('TITLE_GENERATE.md', {
        CONVERSATION_CONTENT: conversationContent,
      });

      const model = this.createLanguageModel(llmConfig);

      const titleResult = await generateText({
        model,
        messages: [{ role: 'user', content: prompt }],
      });

      let titleText = '';
      if (typeof titleResult.content === 'string') {
        titleText = titleResult.content;
      } else if (Array.isArray(titleResult.content)) {
        const textPart = titleResult.content.find(
          (part) => part.type === 'text',
        );
        titleText = textPart?.type === 'text' ? textPart.text : '';
      }

      const title = titleText.trim().slice(0, 500);

      if (title) {
        await this.conversationRepository.update(
          { id: conversationId },
          { title },
        );
      }
    } catch (error) {
      this.logger.error('Failed to generate title', error);
    }
  }

  private async handleStreamFinish(
    assistantMsgId: string,
    conversationId: string,
    accumulatedText: string,
    llmConfig: AgentLLMConfig,
    assistantMsgMetadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.messageRepository.update(
        { id: assistantMsgId },
        {
          content: accumulatedText,
          metadata: {
            ...assistantMsgMetadata,
            status: 'completed',
          },
        },
      );
      const allMessages = await this.messageRepository.find({
        where: { conversationId },
        order: { createdAt: 'ASC' },
      });
      if (allMessages.length >= 2) {
        const hasCompletedAssistant = allMessages.some(
          (msg) =>
            msg.role === MessageRole.ASSISTANT &&
            msg.metadata?.['status'] === 'completed',
        );
        if (hasCompletedAssistant) {
          await this.generateTitle(conversationId, llmConfig);
        }
      }
    } catch (error) {
      this.logger.error('Failed to complete stream finish tasks', error);
    }
  }

  async vulAnalyze(
    vulnerabilityJson: string,
    workspaceId: string,
  ): Promise<string> {
    try {
      const llmConfig = await this.resolveLLMConfig(workspaceId);

      const prompt = this.getPrompt('VUL_ANALYZE.md', {
        VULNERABILITY_JSON: vulnerabilityJson,
      });

      const model = this.createLanguageModel(llmConfig);
      const tools = this.agentTool.getTools(workspaceId, AgentMode.AGENT);

      let accumulatedText = '';

      const result = streamText({
        model,
        messages: [{ role: 'user', content: prompt }],
        tools,
        stopWhen: stepCountIs(10),
        onChunk: ({ chunk }) => {
          if (chunk.type === 'text-delta') {
            accumulatedText += chunk.text;
          }
        },
      });

      await result.text;

      const modelInfo = `*generated by ${llmConfig.provider}/${llmConfig.model}*`;
      return `${accumulatedText.trim()}\n\n${modelInfo}`;
    } catch (error) {
      this.logger.error('Failed to analyze vulnerability', error);
      throw error;
    }
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

    // If user switched to a different provider, resolve the correct config for it
    if (dto.provider && (dto.provider as LLMProvider) !== llmConfig.provider) {
      const switchedConfig = await this.llmConfigRepository.findOne({
        where: { workspaceId, provider: dto.provider as LLMProvider },
      });
      if (switchedConfig) {
        llmConfig = switchedConfig;
      }
    }

    // Override model in-memory (no DB write) when the provider matches
    if (dto.model && (dto.provider as LLMProvider) === llmConfig.provider) {
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

    await this.validateToolSupport(llmConfig);
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

    const todosEmitter = new EventEmitter();

    const tools = {
      ...this.agentTool.getTools(
        workspaceId,
        dto.agentMode || AgentMode.ASK,
      ),
      ...this.agentTool.getTodoTools(conversation.id, todosEmitter),
    };

    const conversationIdStr = conversation.id;
    const assistantMsgId = assistantMessage.id;
    const assistantMsgMetadata = assistantMessage.metadata;

    const systemPrompt = this.getPrompt('SYSTEM.md');
    const currentLlvmConfig = llmConfig;

    let accumulatedText = '';

    const now = new Date();
    const currentTimeContext = `Current time: ${now.toISOString()} (${now.toLocaleString('en-US', { timeZoneName: 'short' })})`;
    const [stmContext, ltmContext] = await Promise.all([
      this.agentsMemories.stmFormatForPrompt(conversation.id),
      this.agentsMemories.ltmFormatForPrompt(workspaceId),
    ]);

    const todos = (conversation.todos ?? []);
    const todosContext = formatTodosToPrompt(todos);

    const contextParts = [
      systemPrompt,
      currentTimeContext,
      ltmContext,
      stmContext,
      todosContext,
    ].filter(Boolean);

    const result = streamText({
      model,
      messages: [
        {
          role: 'system' as const,
          content: contextParts.join('\n\n'),
        },
        ...modelMessages,
      ],
      ...(tools ? { tools, stopWhen: stepCountIs(10) } : {}),
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          accumulatedText += chunk.text;
        }
      },
      onError: ({ error }) => {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes('tool use') ||
          message.includes('tool_choice') ||
          message.includes('No endpoints found that support tool') ||
          message.includes('does not support tools') ||
          message.includes('tool_calls') ||
          message.includes('tools is not supported')
        ) {
          // Invalidate cache so next request re-checks
          if (
            currentLlvmConfig.provider === LLMProvider.CUSTOM &&
            currentLlvmConfig.apiUrl
          ) {
            this.customToolSupportCache.set(
              `${currentLlvmConfig.apiUrl}:${currentLlvmConfig.model}`,
              false,
            );
          }
          throw new Error(
            `The selected model "${currentLlvmConfig.model}" does not support tool calling. ` +
              'Please switch to a model that supports tools (e.g. gpt-4o, claude-3-5-sonnet, gemini-2.0-flash).',
          );
        }
        throw error;
      },
      onFinish: () => {
        if (accumulatedText) {
           this.handleStreamFinish(
             assistantMsgId,
             conversationIdStr,
             accumulatedText,
             currentLlvmConfig,
             assistantMsgMetadata,
           ).catch((err) => this.logger.error('Error in handleStreamFinish', err));
        }
      },
    });

    const aiStream = result.toUIMessageStream();

    const mergedStream = new ReadableStream<UIMessageChunk>({
      async start(controller) {
        controller.enqueue({
          type: 'data-conversation-created',
          data: {
            conversationId: conversationIdStr,
          },
        } as UIMessageChunk);

        const reader = aiStream.getReader();

        const onTodosUpdated = (updatedTodos: AgentTodoItem[]) => {
          controller.enqueue({
            type: 'data-todos-updated',
            data: { todos: updatedTodos },
          } as unknown as UIMessageChunk);
        };

        todosEmitter.on('todos-updated', onTodosUpdated);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          todosEmitter.off('todos-updated', onTodosUpdated);
          reader.releaseLock();
        }

        controller.close();
      },
    });

    return {
      stream: mergedStream,
      conversationId: conversation.id,
    };
  }
}
