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
import { AgentsSkillsService } from './agents.skills';
import type { AgentTodoItem } from './agents.todo';
import { formatTodosToPrompt } from './agents.todo';
import { AgentTool } from './agents.tools';
import { SendMessageDto } from './dto/message.dto';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentConversationTodo } from './entities/agent-conversation-todo.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentMessageToolCall } from './entities/tool-call.entity';
import { LLMProvider, MessageRole, MessageType } from './enums/agent.enums';
import {
  getLLMProviderConfig,
  getReasoningProviderOptions,
} from './llm-provider-supported';
import { ContextBudgetManager } from './shared/context-budget-manager';
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
  abortSignal?: AbortSignal;
  /** Resolves when critical onFinish DB writes (tool calls, parts, message content) complete */
  finishPromise: Promise<void>;
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
  /** Signal to abort the AI provider call */
  abortSignal?: AbortSignal;
  /** Agent mode determines maxOutputTokens and continuation behavior */
  agentMode?: AgentMode;
}

@Injectable()
export class AgentsCompletionsService {
  private readonly logger = new Logger(AgentsCompletionsService.name);
  private readonly prompts = new Map<string, string>();
  private static readonly PROMPTS_DIR = 'prompts';
  private readonly toolCapableModelsCache = new Map<string, Set<string>>();
  private toolCapableCacheExpiry = 0;
  private static readonly TOOL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  // Default context window (128k) - used for compaction threshold calculation
  private static readonly DEFAULT_CONTEXT_WINDOW = 128000;
  private static readonly COMPACTION_THRESHOLD_RATIO = 0.6;

  constructor(
    @InjectRepository(AgentLLMConfig)
    private readonly llmConfigRepository: Repository<AgentLLMConfig>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,
    @InjectRepository(AgentMessageToolCall)
    private readonly toolCallRepository: Repository<AgentMessageToolCall>,
    @InjectRepository(AgentConversationTodo)
    private readonly todoRepository: Repository<AgentConversationTodo>,
    private readonly agentTool: AgentTool,
    private readonly agentsMemories: AgentsMemoriesService,
    private readonly agentsMcpService: AgentsMcpService,
    private readonly agentsSkillsService: AgentsSkillsService,
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
    accumulatedReasoning: string,
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
          // Fire-and-forget: title generation should not block stream closure
          this.generateTitle(conversationId, llmConfig).catch((err) =>
            this.logger.error('Error generating title', err),
          );
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
      const stuckTodos = await this.todoRepository.find({
        where: { conversationId, status: 'in_progress' as const },
      });

      if (stuckTodos.length === 0) return;

      for (const todo of stuckTodos) {
        todo.status = 'completed';
      }
      await this.todoRepository.save(stuckTodos);

      this.logger.log(
        `[AutoTodo] Auto-completed ${stuckTodos.length} stuck in_progress todos for ${conversationId}`,
      );
    } catch (error) {
      this.logger.error('Failed to auto-complete stuck todos', error);
    }
  }

  /**
   * Resets any in_progress todos back to pending on stream error.
   * This allows the user to retry and have the LLM re-attempt those steps
   * instead of leaving them stuck in in_progress forever.
   * Returns the refreshed todo list for emitting to the frontend.
   */
  private async resetTodosOnError(
    conversationId: string,
  ): Promise<AgentConversationTodo[]> {
    try {
      const inProgressTodos = await this.todoRepository.find({
        where: { conversationId, status: 'in_progress' as const },
      });

      if (inProgressTodos.length === 0) {
        return this.todoRepository.find({
          where: { conversationId },
          order: { sortOrder: 'ASC' },
        });
      }

      for (const todo of inProgressTodos) {
        todo.status = 'pending';
      }
      await this.todoRepository.save(inProgressTodos);

      this.logger.log(
        `[AutoTodo] Reset ${inProgressTodos.length} in_progress todos back to pending for ${conversationId}`,
      );

      // Return full updated list for emission
      return this.todoRepository.find({
        where: { conversationId },
        order: { sortOrder: 'ASC' },
      });
    } catch (error) {
      this.logger.error('Failed to reset todos on error', error);
      return this.todoRepository.find({
        where: { conversationId },
        order: { sortOrder: 'ASC' },
      });
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
        stopWhen: stepCountIs(20),
        ...(() => {
          const opts = getReasoningProviderOptions(llmConfig.provider);
          return opts ? { providerOptions: opts } : {};
        })(),
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
   * Fetches messages from the conversation for building context.
   * When a summary exists, only recent messages are needed (old context is in summary).
   */
  private async getConversationHistory(
    conversationId: string,
    hasSummary: boolean,
  ): Promise<AgentMessage[]> {
    // If summary exists, only keep recent messages (old context is in summary)
    const take = hasSummary ? 5 : 20;
    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take,
    });
    return messages.reverse();
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
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Smart context pruning based on token budget.
   * Instead of fixed message counts, dynamically selects how many messages to keep
   * based on the model's context window and current token usage.
   *
   * @param messages - Full conversation history from DB
   * @param contextParts - System context strings (prompts, memory, etc.)
   * @param hasSummary - Whether a conversation summary exists
   * @param contextWindow - Model's context window size
   * @returns Pruned messages array fitting within budget
   */
  private pruneContextByBudget(
    messages: AgentMessage[],
    contextParts: string[],
    hasSummary: boolean,
    contextWindow: number,
  ): AgentMessage[] {
    if (messages.length === 0) return messages;

    const modelMessages = this.mapHistoryToModelMessages(messages);
    const strategy = ContextBudgetManager.getPruningStrategy(
      contextParts,
      modelMessages,
      contextWindow,
    );

    this.logger.debug(
      `[ContextPruning] maxMessages=${strategy.maxMessages}, ` +
        `pruneToolDetails=${strategy.pruneToolDetails}, ` +
        `totalMessages=${messages.length}`,
    );

    if (strategy.maxMessages >= messages.length && !strategy.pruneToolDetails) {
      return messages;
    }

    let pruned = messages.slice(-strategy.maxMessages);

    if (strategy.pruneToolDetails && pruned.length > 2) {
      pruned = pruned.map((msg, index) => {
        if (index >= pruned.length - 2) return msg;
        if (msg.content.length > 2000) {
          return {
            ...msg,
            content:
              msg.content.slice(0, 2000) +
              '\n[...truncated for context management]',
          };
        }
        return msg;
      });
    }

    return pruned;
  }

  /**
   * Checks if context budget is exceeded before a continuation iteration.
   * If exceeded, triggers compaction (summarization) to free up context space.
   * This runs BEFORE each continuation iteration to prevent context overflow.
   *
   * @param conversationId - Current conversation ID
   * @param llmConfig - LLM configuration for summarization
   * @param contextParts - Current system context parts
   * @param modelMessages - Current conversation history
   * @returns true if compaction was triggered, false otherwise
   */
  private async checkAndCompactMidLoop(
    conversationId: string,
    llmConfig: AgentLLMConfig,
    contextParts: string[],
    modelMessages: Array<{ role: string; content: string }>,
  ): Promise<boolean> {
    try {
      const contextWindow = this.getModelContextWindow(llmConfig);
      const budgetCheck = ContextBudgetManager.checkBudget(
        contextParts,
        modelMessages,
        contextWindow,
      );

      this.logger.debug(
        `[MidLoopCompaction] conversation=${conversationId}, ` +
          `tokens=${budgetCheck.totalTokens}/${budgetCheck.budget.availableForInput}, ` +
          `needsCompaction=${budgetCheck.needsCompaction}`,
      );

      if (budgetCheck.needsCompaction) {
        this.logger.log(
          `[MidLoopCompaction] Triggering mid-loop compaction for ${conversationId} ` +
            `(${budgetCheck.totalTokens} tokens >= ${budgetCheck.budget.compactionThreshold} threshold)`,
        );
        await this.compactConversation(conversationId, llmConfig);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.warn(
        `[MidLoopCompaction] Error checking budget, skipping compaction: ${error}`,
      );
      return false;
    }
  }

  /**
   * Generates a comprehensive summary of the entire conversation after all
   * continuation iterations complete. This provides a final overview of
   * what was accomplished, key findings, and recommendations.
   *
   * @param conversationId - Current conversation ID
   * @param llmConfig - LLM configuration for generation
   */
  private async generateEndOfConversationReport(
    conversationId: string,
    llmConfig: AgentLLMConfig,
  ): Promise<void> {
    try {
      const messages = await this.messageRepository.find({
        where: { conversationId },
        order: { createdAt: 'ASC' },
      });

      if (messages.length < 2) {
        return;
      }

      const conversationContent = messages
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n\n');

      const prompt = this.getPrompt('SUMMARY_GENERATE.md', {
        CONVERSATION_CONTENT: conversationContent,
      });

      const model = this.createLanguageModel(llmConfig);

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
          `[EndOfConversation] Report generated for ${conversationId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[EndOfConversation] Failed to generate report for ${conversationId}`,
        error,
      );
    }
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
    userId?: string,
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
      userId
        ? this.agentsMemories.ltmFormatForPrompt(workspaceId, userId)
        : Promise.resolve(''),
    ]);

    const todoEntities = await this.todoRepository.find({
      where: { conversationId: conversation.id },
      order: { sortOrder: 'ASC' },
    });
    const todos = todoEntities.map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status,
      sortOrder: t.sortOrder,
      updatedAt: t.updatedAt.toISOString(),
    }));
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
  /**
   * Retrieves the effective context window for a given LLM config.
   * Priority: contextWindow column (user override) > default (128k).
   * The contextWindow column is set by the user when creating/updating
   * an LLM config. If not set, falls back to the default.
   */
  private getModelContextWindow(llmConfig: AgentLLMConfig): number {
    if (llmConfig.contextWindow && llmConfig.contextWindow > 0) {
      return llmConfig.contextWindow;
    }
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
      abortSignal,
    } = options;

    // Accumulate text and reasoning as chunks arrive during streaming
    let accumulatedText = '';
    let accumulatedReasoning = '';

    // Use the shared EventEmitter from caller to communicate todo events between tool calls and the stream
    const { todosEmitter } = options;

    // Promise that resolves when critical onFinish DB writes complete.
    // The continuation loop awaits this before reading DB for todo status,
    // preventing stale-data reads when onFinish DB writes are still in-flight.
    let resolveFinish: (() => void) | undefined;
    const finishPromise = new Promise<void>((resolve) => {
      resolveFinish = resolve;
    });

    // Check if request was already aborted before starting the AI call
    if (abortSignal?.aborted) {
      this.logger.log(
        `Stream aborted before starting for conversation ${conversationId}`,
      );
      // Return an empty stream that immediately closes
      const emptyStream = new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close();
        },
      });
      resolveFinish?.();
      return {
        aiStream: emptyStream,
        conversationId,
        todosEmitter,
        finishPromise,
      };
    }

    // Determine max output tokens based on agent mode and LLM config
    // AGENT mode needs more tokens for multi-step tool execution
    const maxOutputTokens =
      llmConfig.maxOutputTokens ??
      (options.agentMode === AgentMode.AGENT ? 32768 : undefined);

    // Invoke the AI SDK streamText with all callbacks
    const result = streamText({
      model,
      // System context passed via dedicated option (avoids prompt injection risk)
      system: contextParts.join('\n\n'),
      messages: modelMessages,
      // Retry transient provider errors (429 rate-limit, 500/502/503 server errors)
      maxRetries: 3,
      // Detect stuck streams: abort if no chunk arrives within 30 seconds
      timeout: { chunkMs: 30_000 },
      // Only include tools if available (models without tool support will error here)
      ...(tools
        ? {
            tools,
            stopWhen: stepCountIs(llmConfig.maxSteps ?? 20),
          }
        : {}),
      // Enable reasoning/thinking via provider-specific options
      ...(() => {
        const opts = getReasoningProviderOptions(llmConfig.provider);
        return opts ? { providerOptions: opts } : {};
      })(),
      // AGENT mode needs more output tokens for multi-step execution
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      // Accumulate text-delta and reasoning chunks as they arrive
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          accumulatedText += chunk.text;
        } else if (chunk.type === 'reasoning-delta') {
          accumulatedReasoning += chunk.text;
        }
      },
      // Handle errors from the AI provider (rate-limit, invalid key, etc.)
      // Never throw here — throwing in onError can crash the stream.
      // Instead, emit the error so it propagates to the frontend as a stream event.
      onError: ({ error }) => {
        this.logger.error('[Agent] Stream error during execution', error);
        // Extract the most informative message from the error
        let errorMessage: string;
        if (error instanceof Error) {
          // Unwrap nested AI SDK errors (e.g., AI_RateLimitError wraps provider detail)
          errorMessage = error.message;
          const cause = (error as Error & { cause?: unknown }).cause;
          if (cause instanceof Error && cause.message) {
            errorMessage = `${error.message}: ${cause.message}`;
          }
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else {
          errorMessage = 'An unknown stream error occurred';
        }
        todosEmitter.emit('stream-error', { message: errorMessage });

        // Reset in_progress todos back to pending so they can be retried.
        // Fire-and-forget: don't block the error propagation.
        this.resetTodosOnError(conversationId)
          .then((updatedTodos) => {
            todosEmitter.emit('todos-updated', updatedTodos);
          })
          .catch((err) =>
            this.logger.error('Failed to reset todos on stream error', err),
          );
      },
      // Pass abort signal so AI SDK can cancel the provider call
      abortSignal,
      // When streaming completes, persist accumulated text to DB
      // persist tool call data (for history rendering on page reload),
      // auto-complete stuck todos, and trigger compaction check
      onFinish: (event) => {
        const isAborted = () => abortSignal?.aborted ?? false;

        this.logger.log(
          `[Agent] Stream ${conversationId} finished: ` +
            `finishReason=${event.finishReason}, ` +
            `steps=${event.steps.length}, ` +
            `toolCalls=${event.toolCalls.length}, ` +
            `agentMode=${options.agentMode ?? 'unknown'}`,
        );

        const markAborted = () => {
          this.messageRepository
            .update(
              { id: assistantMessageId },
              {
                content: '',
                metadata: { ...assistantMessageMetadata, status: 'aborted' },
              },
            )
            .catch((err) =>
              this.logger.error('Error saving aborted message', err),
            );
        };

        if (isAborted()) {
          markAborted();
          resolveFinish?.();
          return;
        }

        // Critical DB writes are awaited internally and resolve finishPromise
        // when complete. Non-critical operations remain fire-and-forget.
        (async () => {
          // Persist tool calls for history rendering on page reload
          try {
            const toolCallEntities: AgentMessageToolCall[] = [];
            for (const step of event.steps) {
              for (const toolCall of step.toolCalls) {
                const toolResult = step.toolResults.find(
                  (r) => r.toolCallId === toolCall.toolCallId,
                );
                toolCallEntities.push(
                  this.toolCallRepository.create({
                    messageId: assistantMessageId,
                    conversationId,
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    args: toolCall.input as Record<string, unknown>,
                    result:
                      (toolResult?.output as Record<string, unknown>) ?? null,
                    isError: !toolResult,
                  }),
                );
              }
            }
            if (toolCallEntities.length > 0) {
              await this.toolCallRepository.save(toolCallEntities);
            }
          } catch (err) {
            this.logger.error('Error saving tool calls', err);
          }

          if (isAborted()) {
            markAborted();
            return;
          }

          // Build parts array for frontend rendering
          try {
            const parts: Record<string, unknown>[] = [];
            let hasReasoningPart = false;
            for (const step of event.steps) {
              const stepReasoning =
                typeof step.reasoning === 'string' ? step.reasoning : '';
              if (stepReasoning.trim()) {
                parts.push({ type: 'reasoning', text: stepReasoning.trim() });
                hasReasoningPart = true;
              }
              for (const tc of step.toolCalls) {
                const toolResult = step.toolResults?.find(
                  (r) => r.toolCallId === tc.toolCallId,
                );
                parts.push({
                  type: 'dynamic-tool',
                  toolCallId: tc.toolCallId,
                  toolName: tc.toolName,
                  state: toolResult ? 'output-available' : 'input-available',
                  input: tc.input,
                  output: toolResult?.output ?? null,
                });
              }
              const stepText = typeof step.text === 'string' ? step.text : '';
              if (stepText.trim()) {
                parts.push({ type: 'text', text: stepText.trim() });
              }
            }
            if (!hasReasoningPart && accumulatedReasoning.trim()) {
              parts.unshift({
                type: 'reasoning',
                text: accumulatedReasoning.trim(),
              });
            }
            if (parts.length > 0) {
              await this.messageRepository.update(
                { id: assistantMessageId },
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                { parts: parts as any },
              );
            }
          } catch (err) {
            this.logger.error('Error saving parts array', err);
          }

          // handleStreamFinish updates message content + status to 'completed'
          await this.handleStreamFinish(
            assistantMessageId,
            conversationId,
            accumulatedText,
            accumulatedReasoning,
            llmConfig,
            assistantMessageMetadata,
          ).catch((err) =>
            this.logger.error('Error in handleStreamFinish', err),
          );
        })()
          .catch((err) =>
            this.logger.error('Error in critical onFinish writes', err),
          )
          .finally(() => {
            // Signal to the continuation loop that critical writes are done
            resolveFinish?.();

            // Non-critical operations (fire-and-forget, do NOT block continuation)
            if (options.agentMode !== AgentMode.AGENT) {
              this.autoCompleteStuckTodos(conversationId).catch((err) =>
                this.logger.error('Error in autoCompleteStuckTodos', err),
              );
            }

            this.handlePostStreamCompaction(
              conversationId,
              llmConfig,
              contextParts,
              modelMessages,
            ).catch((err) =>
              this.logger.error('Error in post-stream compaction', err),
            );
          });
      },
    });

    // Convert the result stream to a UIMessageStream consumable by the frontend
    const aiStream = result.toUIMessageStream();

    return { aiStream, conversationId, todosEmitter, finishPromise };
  }

  // ================================================================
  //  Continuation Loop — Multi-Iteration Agent Execution
  // ================================================================

  /**
   * Executes streamText in a loop, continuing automatically when there are
   * remaining pending steps. This prevents the model from stopping mid-plan.
   *
   * The loop uses budget-based termination:
   * - Continues while there are pending/in_progress todos AND context budget allows
   * - Triggers mid-loop compaction when token budget is exceeded
   * - Generates a comprehensive end-of-conversation report when done
   * - Safety net of 50 iterations prevents infinite loops
   *
   * Each iteration creates its own assistant message in DB.
   * The stream stays open until all iterations complete or budget exhausted.
   */
  private createContinuationStream(
    options: StreamTextOptions & {
      workspaceId: string;
      userId?: string;
      skillsContext?: string;
    },
  ): ReadableStream<UIMessageChunk> {
    const {
      llmConfig,
      model,
      conversationId,
      todosEmitter,
      abortSignal,
      agentMode,
      workspaceId,
      userId,
      skillsContext,
    } = options;

    const MAX_SAFETY_ITERATIONS = 50; // Safety net — budget-based termination is primary
    const isAgentMode = agentMode === AgentMode.AGENT;

    let currentModelMessages = [...options.modelMessages];
    let currentAssistantMessageId = options.assistantMessageId;
    let currentAssistantMetadata = options.assistantMessageMetadata;
    let currentContextParts = [...options.contextParts];

    return new ReadableStream<UIMessageChunk>({
      start: async (controller) => {
        let controllerClosed = false;

        const onAbort = () => {
          if (controllerClosed) return;
          controllerClosed = true;
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        };

        if (abortSignal) {
          abortSignal.addEventListener('abort', onAbort, { once: true });
        }

        // Subscribe to todos-updated events from the initial emitter
        const onTodosUpdated = (updatedTodos: AgentTodoItem[]) => {
          if (controllerClosed) return;
          controller.enqueue({
            type: 'data-todos-updated',
            data: { todos: updatedTodos },
          } as unknown as UIMessageChunk);
        };
        todosEmitter.on('todos-updated', onTodosUpdated);

        // Subscribe to remote-execute-output events for real-time terminal streaming
        const onRemoteExecuteOutput = (data: {
          toolCallId: string;
          type: number;
          data: string;
          exitCode: number;
        }) => {
          if (controllerClosed) return;
          controller.enqueue({
            type: 'data-remote-execute-output',
            data,
          } as unknown as UIMessageChunk);
        };
        todosEmitter.on('remote-execute-output', onRemoteExecuteOutput);

        // Subscribe to stream-error events (provider errors propagated to frontend)
        const onStreamError = (data: { message: string }) => {
          if (controllerClosed) return;
          controller.enqueue({
            type: 'error',
            error: data,
          } as unknown as UIMessageChunk);
        };
        todosEmitter.on('stream-error', onStreamError);

        // Emit initial conversation-created event
        controller.enqueue({
          type: 'data-conversation-created',
          data: { conversationId },
        });

        try {
          for (
            let iteration = 0;
            iteration < MAX_SAFETY_ITERATIONS;
            iteration++
          ) {
            if (abortSignal?.aborted || controllerClosed) break;

            // Mid-loop compaction: check budget before each iteration
            if (isAgentMode && iteration > 0) {
              const compacted = await this.checkAndCompactMidLoop(
                conversationId,
                llmConfig,
                currentContextParts,
                currentModelMessages,
              );
              if (compacted) {
                // Re-fetch context after compaction
                const postCompactConversation =
                  await this.conversationRepository.findOne({
                    where: { id: conversationId },
                  });
                if (postCompactConversation?.summary) {
                  // Refresh context with updated summary
                  const agentModeVal = agentMode || AgentMode.ASK;
                  const modePrompt = this.getPrompt(
                    `${agentModeVal.toUpperCase()}.md`,
                  );
                  const systemPrompt = this.getPrompt('SYSTEM.md');
                  const now = new Date();
                  const currentTimeContext = `Current time: ${now.toISOString()} (${now.toLocaleString('en-US', { timeZoneName: 'short' })})`;
                  const [stmCtx, ltmCtx] = await Promise.all([
                    this.agentsMemories.stmFormatForPrompt(conversationId),
                    userId
                      ? this.agentsMemories.ltmFormatForPrompt(
                          workspaceId,
                          userId,
                        )
                      : Promise.resolve(''),
                  ]);
                  const postCompactTodos = await this.todoRepository.find({
                    where: { conversationId },
                    order: { sortOrder: 'ASC' },
                  });
                  const todosCtx = formatTodosToPrompt(
                    postCompactTodos.map((t) => ({
                      id: t.id,
                      content: t.content,
                      status: t.status,
                      sortOrder: t.sortOrder,
                      updatedAt: t.updatedAt.toISOString(),
                    })),
                  );
                  const summaryCtx = postCompactConversation.summary
                    ? `[PREVIOUS CONVERSATION SUMMARY]:\n${postCompactConversation.summary}`
                    : '';

                  currentContextParts = [
                    modePrompt,
                    systemPrompt,
                    summaryCtx,
                    currentTimeContext,
                    ltmCtx,
                    stmCtx,
                    todosCtx,
                  ].filter(Boolean);

                  if (skillsContext) {
                    currentContextParts.push(skillsContext);
                  }
                }
              }
            }

            try {
              // Execute a single streamText iteration
              const { aiStream, finishPromise } = this.executeStreamText({
                llmConfig,
                model,
                modelMessages: currentModelMessages,
                contextParts: currentContextParts,
                assistantMessageId: currentAssistantMessageId,
                conversationId,
                assistantMessageMetadata: currentAssistantMetadata,
                tools: options.tools,
                todosEmitter,
                abortSignal,
                agentMode,
              });

              // Pump chunks from this iteration's stream
              const reader = aiStream.getReader();
              while (true) {
                if (abortSignal?.aborted || controllerClosed) {
                  await reader.cancel().catch(() => {});
                  break;
                }
                const { done, value } = await reader.read();
                if (done || controllerClosed) break;
                controller.enqueue(value);
              }

              // Wait for critical onFinish DB writes (tool calls, parts, message content)
              // to complete before reading DB for todo status. Without this,
              // the continuation loop reads stale data because onFinish DB writes
              // are async and may not have committed yet when the reader drains.
              await finishPromise;
            } catch (iterationError) {
              this.logger.error(
                `[Continuation] Error in iteration ${iteration} for ${conversationId}`,
                iterationError,
              );
              // Don't break on non-fatal errors — try next iteration
              // Only break if abort signal fired or controller is closed
              if (abortSignal?.aborted || controllerClosed) break;
              // Reset in_progress todos back to pending so the next iteration
              // can re-attempt them. Await to ensure DB is updated before
              // the loop reads stale data.
              const updatedTodos = await this.resetTodosOnError(conversationId);
              todosEmitter.emit('todos-updated', updatedTodos);
              continue;
            }

            if (abortSignal?.aborted || controllerClosed) break;

            // Check if we should auto-continue (AGENT mode + pending steps)
            if (!isAgentMode) break;

            const conversation = await this.conversationRepository.findOne({
              where: { id: conversationId },
            });

            const todoEntities = await this.todoRepository.find({
              where: { conversationId },
              order: { sortOrder: 'ASC' },
            });
            const todos = todoEntities.map((t) => ({
              id: t.id,
              content: t.content,
              status: t.status,
              updatedAt: t.updatedAt.toISOString(),
            }));
            const hasPending = todos.some(
              (t) => t.status === 'pending' || t.status === 'in_progress',
            );

            if (!hasPending) break;

            // Prepare next iteration context with smart pruning
            const contextWindow = this.getModelContextWindow(llmConfig);
            // Always fetch up to 20 messages in continuation loop regardless
            // of summary. hasSummary=true limits to 5 messages which loses
            // tool call context from previous iteration.
            const updatedMessages = await this.getConversationHistory(
              conversationId,
              false,
            );
            const prunedMessages = this.pruneContextByBudget(
              updatedMessages,
              currentContextParts,
              !!conversation?.summary,
              contextWindow,
            );
            currentModelMessages =
              this.mapHistoryToModelMessages(prunedMessages);

            // Synthesized "continue" message (NOT saved to DB — memory only)
            // Include specific pending step IDs to help LLM resume correctly
            const pendingSteps = todos.filter(
              (t) => t.status === 'pending' || t.status === 'in_progress',
            );
            const pendingList = pendingSteps
              .map(
                (t, i) =>
                  `${i + 1}. [${t.status.toUpperCase()}] ${t.content} (id: ${t.id})`,
              )
              .join('\n');
            currentModelMessages.push({
              role: 'user' as const,
              content:
                `Continue executing the pending plan steps. Here are the remaining steps:\n${pendingList}\n\n` +
                'Start with the FIRST pending step. Do NOT create new steps. Do NOT skip steps. Execute them in order until all are done.',
            });

            // Create a new assistant message in DB for the next iteration
            const newAssistant = await this.saveAssistantMessage(
              conversationId,
              llmConfig,
            );
            currentAssistantMessageId = newAssistant.id;
            currentAssistantMetadata = newAssistant.metadata;

            // Rebuild context to reflect updated todos
            const updatedConversation =
              await this.conversationRepository.findOne({
                where: { id: conversationId },
              });
            if (updatedConversation) {
              // Build system context fresh
              const agentModeVal = agentMode || AgentMode.ASK;
              const modePrompt = this.getPrompt(
                `${agentModeVal.toUpperCase()}.md`,
              );
              const systemPrompt = this.getPrompt('SYSTEM.md');
              const now = new Date();
              const currentTimeContext = `Current time: ${now.toISOString()} (${now.toLocaleString('en-US', { timeZoneName: 'short' })})`;
              const [stmContext, ltmContext] = await Promise.all([
                this.agentsMemories.stmFormatForPrompt(conversationId),
                userId
                  ? this.agentsMemories.ltmFormatForPrompt(workspaceId, userId)
                  : Promise.resolve(''),
              ]);
              const updatedTodoEntities = await this.todoRepository.find({
                where: { conversationId },
                order: { sortOrder: 'ASC' },
              });
              const updatedTodos = updatedTodoEntities.map((t) => ({
                id: t.id,
                content: t.content,
                status: t.status,
                sortOrder: t.sortOrder,
                updatedAt: t.updatedAt.toISOString(),
              }));
              const todosContext = formatTodosToPrompt(updatedTodos);
              const summaryContext = updatedConversation.summary
                ? `[PREVIOUS CONVERSATION SUMMARY]:\n${updatedConversation.summary}`
                : '';

              currentContextParts = [
                modePrompt,
                systemPrompt,
                summaryContext,
                currentTimeContext,
                ltmContext,
                stmContext,
                todosContext,
              ].filter(Boolean);

              if (skillsContext) {
                currentContextParts.push(skillsContext);
              }
            }

            this.logger.log(
              `[Auto-continuation] Iteration ${iteration + 1} for ${conversationId}: ` +
                `${todos.filter((t) => t.status === 'pending' || t.status === 'in_progress').length} steps remaining`,
            );
          }
        } finally {
          if (abortSignal) {
            abortSignal.removeEventListener('abort', onAbort);
          }
          todosEmitter.off('todos-updated', onTodosUpdated);
          todosEmitter.off('remote-execute-output', onRemoteExecuteOutput);
          todosEmitter.off('stream-error', onStreamError);

          // Auto-complete stuck in_progress todos AFTER all continuation
          // iterations are done. This prevents the race condition where
          // autoCompleteStuckTodos (previously called per-iteration in
          // onFinish) would mark todos as completed before the continuation
          // loop could detect them as still pending.
          if (isAgentMode && !abortSignal?.aborted) {
            this.autoCompleteStuckTodos(conversationId).catch((err) =>
              this.logger.error('Error in autoCompleteStuckTodos', err),
            );

            // Fire-and-forget: report generation should not block stream closure
            this.generateEndOfConversationReport(
              conversationId,
              llmConfig,
            ).catch((err) =>
              this.logger.error(
                'Error in generateEndOfConversationReport',
                err,
              ),
            );
          }
        }

        if (!controllerClosed && !abortSignal?.aborted) {
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        }
      },
    });
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
   * 6. Execute streamText with auto-continuation loop
   * 7. Wrap stream with conversation metadata + todo events
   */
  async streamMessage(
    dto: SendMessageDto,
    workspaceId: string,
    userId: string,
    abortSignal?: AbortSignal,
  ): Promise<StreamMessageResult> {
    // Step 1: Find or create the conversation
    const conversation = await this.getOrCreateConversation(
      dto,
      workspaceId,
      userId,
    );

    // Step 2: Save the user's message to DB
    await this.saveUserMessage(conversation.id, dto.question);

    // Step 3: Fetch conversation history
    // When summary exists, only recent messages needed (old context is in summary)
    const historyMessages = await this.getConversationHistory(
      conversation.id,
      !!conversation.summary,
    );

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

    // Check if request was aborted before creating assistant message
    if (abortSignal?.aborted) {
      this.logger.log(
        `Stream aborted before assistant message for conversation ${conversation.id}`,
      );
      const emptyStream = new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close();
        },
      });
      return {
        stream: emptyStream,
        conversationId: conversation.id,
      };
    }

    // Step 8: Determine agent mode
    const agentMode = dto.agentMode || AgentMode.ASK;

    // Step 9: Create a placeholder message for the assistant (marks streaming)
    const assistantMessage = await this.saveAssistantMessage(
      conversation.id,
      llmConfig,
    );

    // Step 10: Build the system context
    const contextParts = await this.buildSystemContext(
      conversation,
      workspaceId,
      agentMode,
      userId,
    );

    // Step 10.5: Add skills context and loadSkill tool
    let skillsContext: string | undefined;
    const skillsPrompt =
      await this.agentsSkillsService.buildSkillsPrompt(workspaceId);
    let loadSkillTool:
      | ReturnType<AgentsSkillsService['createLoadSkillTool']>
      | undefined;
    if (skillsPrompt) {
      contextParts.push(skillsPrompt);
      skillsContext = skillsPrompt;
      loadSkillTool = this.agentsSkillsService.createLoadSkillTool(workspaceId);
    }

    // Step 11: Create a shared event emitter for broadcasting todo updates to the stream
    const todosEmitter = new EventEmitter();

    // Get tools for the current agent mode
    const tools = {
      ...(this.agentTool.getTools(
        workspaceId,
        agentMode,
        todosEmitter,
        conversation.id,
      ) as ToolSet),
      ...(this.agentTool.getTodoTools(
        conversation.id,
        todosEmitter,
      ) as ToolSet),
      ...(loadSkillTool ? { load_skill: loadSkillTool } : {}),
      // Add memory tools
      ...(this.agentTool.getMemoryTools(
        workspaceId,
        userId,
        conversation.id,
      ) as ToolSet),
    };

    // Step 12: Build the combined stream with auto-continuation
    const toolSetArg: ToolSet | undefined =
      Object.keys(tools).length > 0 ? tools : undefined;

    const stream = this.createContinuationStream({
      llmConfig,
      model,
      modelMessages,
      contextParts,
      assistantMessageId: assistantMessage.id,
      conversationId: conversation.id,
      assistantMessageMetadata: assistantMessage.metadata,
      tools: toolSetArg,
      todosEmitter,
      abortSignal,
      agentMode,
      workspaceId,
      userId,
      skillsContext,
    });

    // Step 13: Return stream + conversationId to the controller
    return {
      stream,
      conversationId: conversation.id,
    };
  }
}
