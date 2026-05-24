import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LanguageModel, ToolSet, UIMessageChunk } from 'ai';
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
import { TokenCounter } from './shared/token-counter';

export interface StreamMessageResult {
  stream: ReadableStream<UIMessageChunk>;
  conversationId: string;
}

/** Parameters for creating the merged ReadableStream result */
interface StreamCreationParams {
  aiStream: ReadableStream<UIMessageChunk>;
  conversationId: string;
  todosEmitter: EventEmitter;
}

/** Parameters for building streamText call options */
interface StreamTextOptions {
  llmConfig: AgentLLMConfig;
  model: LanguageModel;
  modelMessages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  contextParts: string[];
  assistantMessageId: string;
  conversationId: string;
  assistantMessageMetadata: Record<string, unknown> | undefined;
  tools: ToolSet | undefined;
  /** Shared event emitter for broadcasting todo updates to the stream */
  todosEmitter: EventEmitter;
}

@Injectable()
export class AgentsCompletionsService {
  private readonly logger = new Logger(AgentsCompletionsService.name);
  private readonly prompts = new Map<string, string>();
  private static readonly PROMPTS_DIR = 'prompts';
  private readonly toolCapableModelsCache = new Map<string, Set<string>>();
  private toolCapableCacheExpiry = 0;
  private static readonly TOOL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  // Cache for custom/Ollama model tool support: key = `${baseURL}:${model}`, value = boolean
  private readonly customToolSupportCache = new Map<string, boolean>();
  // Default context window (128k) - used for compaction threshold calculation
  private static readonly DEFAULT_CONTEXT_WINDOW = 128000;
  private static readonly COMPACTION_THRESHOLD_RATIO = 0.7;

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
        }
      }
    }
  }

  private getPrompt(fileName: string, data?: Record<string, unknown>): string {
    const key = fileName.toLowerCase();
    const template = this.prompts.get(key) ?? '';
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
    assistantMsgMetadata: Record<string, unknown> | undefined,
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

  /**
   * Auto-completes any todos that the LLM left in "in_progress" state
   * after producing a response. This is a safety net when the LLM forgets
   * to call transition_step(id, "completed") after finishing work.
   */
  private async autoCompleteStuckTodos(conversationId: string): Promise<void> {
    try {
      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
      });
      if (!conversation) return;

      const todos = conversation.todos ?? [];
      let changed = false;

      const updatedTodos = todos.map((t) => {
        if (t.status === 'in_progress') {
          changed = true;
          return {
            ...t,
            status: 'completed' as const,
            updatedAt: new Date().toISOString(),
          };
        }
        return t;
      });

      if (changed) {
        await this.conversationRepository.update(
          { id: conversationId },
          { todos: updatedTodos },
        );
        this.logger.log(
          `[AutoTodo] Auto-completed stuck in_progress todos for ${conversationId}`,
        );
        // Note: frontend will see updated todos on next poll/fetch
      }
    } catch (error) {
      this.logger.error('Failed to auto-complete stuck todos', error);
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

  // ================================================================
  //  Private helper methods for streamMessage - extracted into small,
  //  focused functions for readability, maintainability and testability.
  // ================================================================

  /**
   * Finds an existing conversation by ID or creates a new one.
   * - If dto.conversationId exists in DB → reuse it
   * - If dto.conversationId is provided but not found → create with that ID
   * - If no conversationId → create a brand new conversation
   */
  private async getOrCreateConversation(
    dto: SendMessageDto,
    workspaceId: string,
    userId: string,
  ): Promise<AgentConversation> {
    // If conversationId is provided, try to find it in DB
    if (dto.conversationId) {
      const existing = await this.conversationRepository.findOne({
        where: { id: dto.conversationId, workspaceId },
      });
      if (existing) {
        return existing; // Return existing conversation
      }

      // Not found (client may have pre-generated the ID), create with that ID
      const llmConfig = await this.resolveLLMConfig(
        workspaceId,
        dto.provider,
        dto.model,
      );
      const newConversation = this.conversationRepository.create({
        id: dto.conversationId,
        workspaceId,
        llmConfigId: llmConfig.id,
        title: dto.question.slice(0, 500),
        createdBy: userId,
        agentMode: dto.agentMode,
      });
      return this.conversationRepository.save(newConversation);
    }

    // No conversationId provided, create a new conversation
    const llmConfig = await this.resolveLLMConfig(
      workspaceId,
      dto.provider,
      dto.model,
    );
    const newConversation = this.conversationRepository.create({
      workspaceId,
      llmConfigId: llmConfig.id,
      title: dto.question.slice(0, 500),
      createdBy: userId,
      agentMode: dto.agentMode,
    });
    return this.conversationRepository.save(newConversation);
  }

  /**
   * Saves the user's message to the database.
   * The message is associated with the conversationId, role is USER, messageType is TEXT.
   */
  private async saveUserMessage(
    conversationId: string,
    question: string,
  ): Promise<AgentMessage> {
    const userMessage = this.messageRepository.create({
      conversationId,
      role: MessageRole.USER,
      content: question,
      messageType: MessageType.TEXT,
    });
    return this.messageRepository.save(userMessage);
  }

  /**
   * Fetches up to 20 most recent messages from the conversation, sorted chronologically.
   * Used to build conversation context for the model.
   */
  private async getConversationHistory(
    conversationId: string,
  ): Promise<AgentMessage[]> {
    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'DESC' }, // Fetch newest first
      take: 20,
    });
    return messages.reverse(); // Reverse to chronological order
  }

  /**
   * Resolves the final LLM config after applying DTO overrides.
   * - Starts from the conversation's default config
   * - If user switches provider → find config for that provider
   * - If user changes model (same provider) → override model in memory (no DB write)
   */
  private async resolveLLMConfigWithOverrides(
    conversation: AgentConversation,
    dto: SendMessageDto,
    workspaceId: string,
  ): Promise<AgentLLMConfig> {
    // Get the base config from the conversation
    let llmConfig = await this.llmConfigRepository.findOne({
      where: { id: conversation.llmConfigId, workspaceId },
    });

    if (!llmConfig) {
      throw new NotFoundException('LLM config not found');
    }

    // If user switched to a different provider, resolve the correct config
    if (dto.provider && (dto.provider as LLMProvider) !== llmConfig.provider) {
      const switchedConfig = await this.llmConfigRepository.findOne({
        where: { workspaceId, provider: dto.provider as LLMProvider },
      });
      if (switchedConfig) {
        llmConfig = switchedConfig;
      }
    }

    // If user changed model within the same provider, override in memory only
    // (Avoids writing to DB which would affect other conversations)
    if (dto.model && (dto.provider as LLMProvider) === llmConfig.provider) {
      llmConfig = this.llmConfigRepository.create({
        ...llmConfig,
        model: dto.model,
      });
    }

    return llmConfig;
  }

  /**
   * Maps DB messages to AI SDK message format.
   * Only keeps role and content, strips unnecessary fields.
   */
  private mapHistoryToModelMessages(
    messages: AgentMessage[],
  ): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    return messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));
  }

  /**
   * Creates and saves a placeholder message for the assistant (streaming).
   * Marked with status='streaming' so the frontend knows chunks are incoming.
   */
  private async saveAssistantMessage(
    conversationId: string,
    llmConfig: AgentLLMConfig,
  ): Promise<AgentMessage> {
    const assistantMessage = this.messageRepository.create({
      conversationId,
      role: MessageRole.ASSISTANT,
      content: '', // Will be updated when streaming completes
      messageType: MessageType.TEXT,
      metadata: {
        model: llmConfig.model,
        provider: llmConfig.provider,
        status: 'streaming',
      },
    });
    return this.messageRepository.save(assistantMessage);
  }

  /**
   * Builds the system context for the model by combining multiple sources:
   * - Mode prompt (ASK, AGENT, VUL_ANALYZE, ...)
   * - Default system prompt
   * - Current timestamp
   * - Workspace long-term memory (LTM)
   * - Conversation short-term memory (STM)
   * - Current todo list
   */
  private async buildSystemContext(
    conversation: AgentConversation,
    workspaceId: string,
    agentMode: AgentMode,
  ): Promise<string[]> {
    // Fetch prompt for the current mode (e.g. ASK.md, AGENT.md)
    const modePrompt = this.getPrompt(`${agentMode.toUpperCase()}.md`);
    // Fetch the shared system prompt
    const systemPrompt = this.getPrompt('SYSTEM.md');

    // Generate current time context string
    const now = new Date();
    const currentTimeContext = `Current time: ${now.toISOString()} (${now.toLocaleString('en-US', { timeZoneName: 'short' })})`;

    // Fetch STM and LTM concurrently
    const [stmContext, ltmContext] = await Promise.all([
      this.agentsMemories.stmFormatForPrompt(conversation.id),
      this.agentsMemories.ltmFormatForPrompt(workspaceId),
    ]);

    // Format the todo list as a prompt string
    const todos = conversation.todos ?? [];
    const todosContext = formatTodosToPrompt(todos);

    // Inject conversation summary if available (from auto-compaction)
    const summaryContext = conversation.summary
      ? `[PREVIOUS CONVERSATION SUMMARY]:\n${conversation.summary}`
      : '';

    // Combine all context parts, filtering out empty ones
    return [
      modePrompt,
      systemPrompt,
      summaryContext,
      currentTimeContext,
      ltmContext,
      stmContext,
      todosContext,
    ].filter(Boolean);
  }

  /**
   * Handles tool-calling errors from streamText.
   * Checks if the error is related to unsupported tool calling:
   * - For CUSTOM provider, caches the negative result to avoid re-checking
   * - Throws a user-friendly error message
   * For other errors, re-throws the original error.
   */
  private handleToolError(error: unknown, llmConfig: AgentLLMConfig): never {
    const message = error instanceof Error ? error.message : String(error);

    // Check if the error message matches known tool-calling error patterns
    const toolErrorPatterns = [
      'tool use',
      'tool_choice',
      'No endpoints found that support tool',
      'does not support tools',
      'tool_calls',
      'tools is not supported',
    ];

    const isToolError = toolErrorPatterns.some((pattern) =>
      message.includes(pattern),
    );

    if (isToolError) {
      // Cache negative result for CUSTOM provider to prevent re-requesting
      if (llmConfig.provider === LLMProvider.CUSTOM && llmConfig.apiUrl) {
        this.customToolSupportCache.set(
          `${llmConfig.apiUrl}:${llmConfig.model}`,
          false,
        );
      }
      throw new Error(
        `The selected model "${llmConfig.model}" does not support tool calling. ` +
          'Please switch to a model that supports tools (e.g. gpt-4o, claude-3-5-sonnet, gemini-2.0-flash).',
      );
    }

    throw error;
  }

  /**
   * Creates a merged ReadableStream that combines:
   * 1. A `conversation-created` metadata chunk at the start of the stream
   * 2. Chunks from the AI stream (text-delta, tool-call, ...)
   * 3. Asynchronous `todos-updated` chunks (emitted by the EventEmitter)
   */
  private createMergedStream(
    params: StreamCreationParams,
  ): ReadableStream<UIMessageChunk> {
    const { aiStream, conversationId, todosEmitter } = params;

    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        // Emit initial chunk to notify the frontend that the conversation was created
        controller.enqueue({
          type: 'data-conversation-created',
          data: { conversationId },
        } as UIMessageChunk);

        // Get a reader for the AI stream to forward text/tool-call chunks
        const reader = aiStream.getReader();

        // Subscribe to todos-updated events from the emitter
        const onTodosUpdated = (updatedTodos: AgentTodoItem[]) => {
          controller.enqueue({
            type: 'data-todos-updated',
            data: { todos: updatedTodos },
          } as unknown as UIMessageChunk);
        };

        todosEmitter.on('todos-updated', onTodosUpdated);

        try {
          // Read chunks from the AI stream one by one
          while (true) {
            const { done, value } = await reader.read();
            if (done) break; // Stream finished
            controller.enqueue(value); // Forward chunk to the merged stream
          }
        } finally {
          // Cleanup: remove listener and release the reader
          todosEmitter.off('todos-updated', onTodosUpdated);
          reader.releaseLock();
        }

        // Close the stream when complete
        controller.close();
      },
    });
  }

  /**
   * Retrieves the effective context window for a given LLM config.
   * Priority: contextWindow column (user override) > OpenRouter cache > default (8192).
   */
  private getModelContextWindow(_llmConfig: AgentLLMConfig): number {
    return AgentsCompletionsService.DEFAULT_CONTEXT_WINDOW;
  }

  /**
   * Determines whether the conversation should be compacted based on
   * estimated token usage vs the model's context window threshold (70%).
   */
  private shouldCompact(
    llmConfig: AgentLLMConfig,
    contextParts: string[],
    modelMessages: Array<{ role: string; content: string }>,
  ): boolean {
    try {
      // Estimate total tokens from system context
      const systemTokens = TokenCounter.estimate(contextParts.join('\n\n'));

      // Estimate tokens from conversation history
      const historyTokens = TokenCounter.estimateParts(
        modelMessages.map((m) => `${m.role}: ${m.content}`),
        '\n',
      );

      const totalTokens = systemTokens + historyTokens;

      // Get model context window
      const modelContext = this.getModelContextWindow(llmConfig);
      const softLimit = Math.floor(
        modelContext * AgentsCompletionsService.COMPACTION_THRESHOLD_RATIO,
      );

      this.logger.debug(
        `[Compaction] tokens=${totalTokens}, modelContext=${modelContext}, ` +
          `softLimit=${softLimit}, shouldCompact=${totalTokens > softLimit}`,
      );

      return totalTokens > softLimit;
    } catch (error) {
      this.logger.warn('Error in shouldCompact, skipping compaction', error);
      return false;
    }
  }

  /**
   * Generates a summary of the conversation history and saves it to the
   * conversation's `summary` field. Runs asynchronously after stream completion.
   */
  private async compactConversation(
    conversationId: string,
    llmConfig: AgentLLMConfig,
  ): Promise<void> {
    try {
      // Fetch recent messages for summarization
      const messages = await this.messageRepository.find({
        where: { conversationId },
        order: { createdAt: 'DESC' } as const,
        take: 20,
      });

      if (messages.length < 2) {
        return; // Not enough messages to summarize
      }

      // Format messages into a conversation string
      const conversationContent = messages
        .reverse()
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n\n');

      // Get the summarization prompt
      const prompt = this.getPrompt('SUMMARY_GENERATE.md', {
        CONVERSATION_CONTENT: conversationContent,
      });

      // Create a model instance for summarization
      const model = this.createLanguageModel(llmConfig);

      // Generate the summary
      const result = await generateText({
        model,
        messages: [{ role: 'user', content: prompt }],
      });

      let summaryText = '';
      if (typeof result.content === 'string') {
        summaryText = result.content;
      } else if (Array.isArray(result.content)) {
        const textPart = result.content.find(
          (part: { type: string }) => part.type === 'text',
        );
        summaryText =
          textPart && 'text' in textPart
            ? (textPart as { text: string }).text
            : '';
      }

      const cleanedSummary = summaryText.trim();

      if (cleanedSummary) {
        await this.conversationRepository.update(
          { id: conversationId },
          { summary: cleanedSummary },
        );
        this.logger.log(
          `[Compaction] Summary saved for conversation ${conversationId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to compact conversation ${conversationId}`,
        error,
      );
    }
  }

  /**
   * Post-stream handler that checks if compaction is needed and triggers it.
   * Runs asynchronously to avoid blocking the stream response.
   */
  private async handlePostStreamCompaction(
    conversationId: string,
    llmConfig: AgentLLMConfig,
    contextParts: string[],
    modelMessages: Array<{ role: string; content: string }>,
  ): Promise<void> {
    const needsCompaction = this.shouldCompact(
      llmConfig,
      contextParts,
      modelMessages,
    );

    if (needsCompaction) {
      this.logger.log(
        `[Compaction] Triggering compaction for conversation ${conversationId}`,
      );
      await this.compactConversation(conversationId, llmConfig);
    }
  }

  /**
   * Builds the streamText options and executes the call, wrapping the result
   * into a merged stream. This is the core of the AI response streaming process.
   */
  private executeStreamText(options: StreamTextOptions): StreamCreationParams {
    const {
      llmConfig,
      model,
      modelMessages,
      contextParts,
      assistantMessageId,
      conversationId,
      assistantMessageMetadata,
      tools,
    } = options;

    // Accumulate text as chunks arrive during streaming
    let accumulatedText = '';

    // Use the shared EventEmitter from caller to communicate todo events between tool calls and the stream
    const { todosEmitter } = options;

    // Invoke the AI SDK streamText with all callbacks
    const result = streamText({
      model,
      // System message containing the assembled context
      messages: [
        {
          role: 'system' as const,
          content: contextParts.join('\n\n'),
        },
        ...modelMessages,
      ],
      // Only include tools if available (models without tool support will error here)
      ...(tools ? { tools, stopWhen: stepCountIs(10) } : {}),
      // Accumulate text-delta chunks as they arrive
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          accumulatedText += chunk.text;
        }
      },
      // Handle errors (especially tool-calling errors)
      onError: ({ error }) => {
        this.handleToolError(error, llmConfig);
      },
      // When streaming completes, persist accumulated text to DB
      // auto-complete stuck todos, and trigger compaction check
      onFinish: () => {
        if (accumulatedText) {
          this.handleStreamFinish(
            assistantMessageId,
            conversationId,
            accumulatedText,
            llmConfig,
            assistantMessageMetadata,
          ).catch((err) =>
            this.logger.error('Error in handleStreamFinish', err),
          );
        }

        // Auto-complete any todos the LLM left "in_progress" (safety net)
        this.autoCompleteStuckTodos(conversationId).catch((err) =>
          this.logger.error('Error in autoCompleteStuckTodos', err),
        );

        // Asynchronously check and trigger compaction if needed
        // Fire-and-forget: does not block the stream response
        this.handlePostStreamCompaction(
          conversationId,
          llmConfig,
          contextParts,
          modelMessages,
        ).catch((err) =>
          this.logger.error('Error in post-stream compaction', err),
        );
      },
    });

    // Convert the result stream to a UIMessageStream consumable by the frontend
    const aiStream = result.toUIMessageStream();

    return { aiStream, conversationId, todosEmitter };
  }

  // ================================================================
  //  Public API
  // ================================================================

  /**
   * Sends a message and returns a streamed response.
   *
   * Overall flow:
   * 1. Find/create conversation → save user message → fetch history
   * 2. Resolve LLM config (provider/model overrides)
   * 3. Validate tool support → create language model
   * 4. Create assistant message placeholder
   * 5. Build system context (prompts + memories + todos)
   * 6. Call streamText → get AI stream
   * 7. Wrap AI stream into merged stream (adds conversation metadata + todos events)
   */
  async streamMessage(
    dto: SendMessageDto,
    workspaceId: string,
    userId: string,
  ): Promise<StreamMessageResult> {
    // Step 1: Find or create the conversation
    const conversation = await this.getOrCreateConversation(
      dto,
      workspaceId,
      userId,
    );

    // Step 2: Save the user's message to DB
    await this.saveUserMessage(conversation.id, dto.question);

    // Step 3: Fetch conversation history (up to 5 most recent messages)
    const historyMessages = await this.getConversationHistory(conversation.id);

    // Step 4: Resolve the final LLM config with user overrides
    const llmConfig = await this.resolveLLMConfigWithOverrides(
      conversation,
      dto,
      workspaceId,
    );

    // Step 5: Map history to AI SDK message format
    const modelMessages = this.mapHistoryToModelMessages(historyMessages);

    // Step 6: Validate that the model supports tool calling
    await this.validateToolSupport(llmConfig);

    // Step 7: Create a LanguageModel instance from the config
    const model = this.createLanguageModel(llmConfig);

    // Step 8: Create a placeholder message for the assistant (marks streaming)
    const assistantMessage = await this.saveAssistantMessage(
      conversation.id,
      llmConfig,
    );

    // Step 9: Build the system context
    const contextParts = await this.buildSystemContext(
      conversation,
      workspaceId,
      dto.agentMode || AgentMode.ASK,
    );

    // Step 10: Create a shared event emitter for broadcasting todo updates to the stream
    const todosEmitter = new EventEmitter();

    // Get tools for the current agent mode
    // Note: AgentTool.getTools() returns `any` typed tools - cast to ToolSet for type safety
    const tools = {
      ...(this.agentTool.getTools(
        workspaceId,
        dto.agentMode || AgentMode.ASK,
      ) as ToolSet),
      ...(this.agentTool.getTodoTools(
        conversation.id,
        todosEmitter, // Pass the same shared emitter so tool calls broadcast to the stream
      ) as ToolSet),
    };

    // Step 11: Execute streamText and get AI stream + todos emitter
    const { aiStream } = this.executeStreamText({
      llmConfig,
      model,
      modelMessages,
      contextParts,
      assistantMessageId: assistantMessage.id,
      conversationId: conversation.id,
      assistantMessageMetadata: assistantMessage.metadata,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      todosEmitter, // Pass the same shared emitter so stream events are in sync
    });

    // Step 12: Wrap AI stream into a merged stream (conversation metadata + todos events)
    const mergedStream = this.createMergedStream({
      aiStream,
      conversationId: conversation.id,
      todosEmitter, // Same emitter used by todo tools - events will reach the stream
    });

    // Step 13: Return stream + conversationId to the controller for the frontend
    return {
      stream: mergedStream,
      conversationId: conversation.id,
    };
  }
}
