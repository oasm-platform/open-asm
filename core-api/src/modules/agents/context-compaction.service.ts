import { PromptRegistry } from '@/common/utils/prompt-registry.util';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { Repository } from 'typeorm';
import type { ResolvedLLMConfig } from './agents.config';
import { AgentsModelsCatalogService } from './agents.models-catalog';
import { ConversationTitleService } from './conversation-title.service';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { LlmConfigResolver } from './llm-config.resolver';
import { ContextBudgetManager } from './shared/context-budget-manager';
import { TokenCounter } from './shared/token-counter';

/**
 * Keeps a conversation inside its model's context window: prunes the history
 * a turn sends by token budget, and compacts (summarizes into
 * `agent_conversations.summary`) when the budget is exceeded, before a
 * continuation iteration or after the stream. A compaction already running
 * for a conversation is joined, not started twice (in this process).
 */
@Injectable()
export class ContextCompactionService {
  private readonly logger = new Logger(ContextCompactionService.name);
  private static readonly COMPACTION_THRESHOLD_RATIO = 0.6;
  private readonly prompts = PromptRegistry.forDirectory(
    path.join(__dirname, 'prompts'),
  );
  /** Compaction in progress by conversation id: a second trigger joins it */
  private readonly compactions = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,
    private readonly modelsCatalog: AgentsModelsCatalogService,
    private readonly llmConfigs: LlmConfigResolver,
    private readonly titles: ConversationTitleService,
  ) {}

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
  pruneContextByBudget(
    messages: AgentMessage[],
    contextParts: string[],
    hasSummary: boolean,
    contextWindow: number,
  ): AgentMessage[] {
    if (messages.length === 0) return messages;

    const modelMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
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
  async checkAndCompactMidLoop(
    conversationId: string,
    llmConfig: ResolvedLLMConfig,
    contextParts: string[],
    modelMessages: Array<{ role: string; content: string }>,
  ): Promise<boolean> {
    try {
      const contextWindow = this.modelsCatalog.resolveWindow(llmConfig).tokens;
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
        `[MidLoopCompaction] Error checking budget, skipping compaction: ${String(error)}`,
      );
      return false;
    }
  }

  /**
   * Determines whether the conversation should be compacted based on
   * estimated token usage vs the model's context window threshold (70%).
   */
  private shouldCompact(
    llmConfig: ResolvedLLMConfig,
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
      const modelContext = this.modelsCatalog.resolveWindow(llmConfig).tokens;
      const softLimit = Math.floor(
        modelContext * ContextCompactionService.COMPACTION_THRESHOLD_RATIO,
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
   * conversation's `summary` field. A compaction already running for the
   * conversation (post-stream and mid-loop can both trigger one) is joined
   * rather than started again.
   */
  private compactConversation(
    conversationId: string,
    llmConfig: ResolvedLLMConfig,
  ): Promise<void> {
    const running = this.compactions.get(conversationId);
    if (running) return running;
    const job = this.runCompaction(conversationId, llmConfig).finally(() =>
      this.compactions.delete(conversationId),
    );
    this.compactions.set(conversationId, job);
    return job;
  }

  private async runCompaction(
    conversationId: string,
    llmConfig: ResolvedLLMConfig,
  ): Promise<void> {
    try {
      // Fetch recent messages for summarization, and the summary they extend
      const [messages, conversation] = await Promise.all([
        this.messageRepository.find({
          where: { conversationId },
          order: { createdAt: 'DESC' } as const,
          take: 20,
          select: ['id', 'role', 'content'],
        }),
        this.conversationRepository.findOne({
          where: { id: conversationId },
          select: ['id', 'summary'],
        }),
      ]);

      if (messages.length < 2) {
        return; // Not enough messages to summarize
      }

      // Format messages into a conversation string
      const conversationContent = messages
        .reverse()
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n\n');

      // Get the summarization prompt. The previous summary is merged in, so
      // what it covered is not lost when older messages leave the window
      const prompt = this.prompts.render('SUMMARY_GENERATE.md', {
        CONVERSATION_CONTENT: conversationContent,
        PREVIOUS_SUMMARY: conversation?.summary ?? '',
      });

      // Create a model instance for summarization
      const model = await this.llmConfigs.createLanguageModel(
        llmConfig,
        llmConfig.workspaceId,
      );

      // Generate the summary
      const cleanedSummary = await this.titles.completeText(
        model,
        prompt,
        llmConfig.provider,
      );

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
  async handlePostStreamCompaction(
    conversationId: string,
    llmConfig: ResolvedLLMConfig,
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
}
