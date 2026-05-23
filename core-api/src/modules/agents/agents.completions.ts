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
import type { AgentTodoItem } from './agents.todo';
import { formatTodosToPrompt } from './agents.todo';
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
   * Searches recursively to handle NestJS asset copy behavior where
   * .md files may be placed in subdirectories (e.g., default/).
   */
  private loadAllPrompts(): void {
    const promptsDir = path.join(
      __dirname,
      AgentsCompletionsService.PROMPTS_DIR,
    );
    try {
      this.loadPromptsRecursive(promptsDir);
    } catch (error) {
      this.logger.error('Failed to load prompts directory', error);
      this.prompts.set('SYSTEM.md', this.defaultPrompts['SYSTEM.md'] ?? '');
    }

    // Fallback: ensure required prompts have at least default content
    for (const [name, content] of Object.entries(this.defaultPrompts)) {
      if (!this.prompts.has(name)) {
        this.logger.warn(`Prompt "${name}" not loaded, using default`);
        this.prompts.set(name, content);
      }
    }
  }

  /**
   * Recursively walks a directory and loads all .md files found.
   * Keys are stored in lowercase for case-insensitive lookup.
   */
  private loadPromptsRecursive(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.loadPromptsRecursive(fullPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const key = entry.name.toLowerCase();
          this.prompts.set(key, fs.readFileSync(fullPath, 'utf-8'));
        } catch (error) {
          this.logger.error(`Failed to load prompt: ${entry.name}`, error);
          this.prompts.set(
            entry.name.toLowerCase(),
            this.defaultPrompts[entry.name] ?? '',
          );
        }
      }
    }
  }

  /**
   * Retrieves a prompt by filename and renders it with Mustache.
   * Returns the default prompt as fallback if loading fails.
   * Lookup is case-insensitive (keys stored in lowercase).
   */
  private getPrompt(fileName: string, data?: Record<string, unknown>): string {
    const key = fileName.toLowerCase();
    const defaultKey = Object.keys(this.defaultPrompts).find(
      (k) => k.toLowerCase() === key,
    );
    const template =
      this.prompts.get(key) ??
      (defaultKey ? this.defaultPrompts[defaultKey] : '');
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
    const modelMessages = reversedHistory.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

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
      ...this.agentTool.getTools(workspaceId, dto.agentMode || AgentMode.ASK),
      ...this.agentTool.getTodoTools(conversation.id, todosEmitter),
    };

    const conversationIdStr = conversation.id;
    const assistantMsgId = assistantMessage.id;
    const assistantMsgMetadata = assistantMessage.metadata;

    const modePrompt = this.getPrompt(`${dto.agentMode.toUpperCase()}.md`);
    const systemPrompt = this.getPrompt('SYSTEM.md');
    const currentLlvmConfig = llmConfig;

    let accumulatedText = '';

    const now = new Date();
    const currentTimeContext = `Current time: ${now.toISOString()} (${now.toLocaleString('en-US', { timeZoneName: 'short' })})`;
    const [stmContext, ltmContext] = await Promise.all([
      this.agentsMemories.stmFormatForPrompt(conversation.id),
      this.agentsMemories.ltmFormatForPrompt(workspaceId),
    ]);

    const todos = conversation.todos ?? [];
    const todosContext = formatTodosToPrompt(todos);

    const contextParts = [
      modePrompt,
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
          ).catch((err) =>
            this.logger.error('Error in handleStreamFinish', err),
          );
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
