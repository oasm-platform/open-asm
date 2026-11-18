import { PromptRegistry } from '@/common/utils/prompt-registry.util';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LanguageModel } from 'ai';
import { streamText } from 'ai';
import * as path from 'path';
import { Repository } from 'typeorm';
import type { ResolvedLLMConfig } from './agents.config';
import { AgentConversationTodo } from './entities/agent-conversation-todo.entity';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { LLMProvider, MessageRole } from './enums/agent.enums';
import { getReasoningProviderOptions } from './llm-provider-supported';
import { LlmConfigResolver } from './llm-config.resolver';
import { updateConversationMetadata } from './shared/conversation-metadata';

/**
 * The short LLM calls around a chat turn: the conversation title (once,
 * while it is still the first question), the goal of an Agent-mode turn, and
 * `completeText`, the one-shot completion the summary and vulnerability
 * analysis use too. Each title/goal generation runs at most once per
 * conversation at a time and never fails the turn.
 */
@Injectable()
export class ConversationTitleService {
  private readonly logger = new Logger(ConversationTitleService.name);
  private readonly prompts = PromptRegistry.forDirectory(
    path.join(__dirname, 'prompts'),
  );
  /** Conversations whose title is being generated */
  private readonly titling = new Set<string>();
  /** Conversations whose goal is being generated */
  private readonly goaling = new Set<string>();

  constructor(
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,
    @InjectRepository(AgentConversationTodo)
    private readonly todoRepository: Repository<AgentConversationTodo>,
    private readonly llmConfigs: LlmConfigResolver,
  ) {}

  /**
   * One-shot text completion for background helpers (title, summary, vuln
   * analysis). Uses streamText, not generateText: some OpenAI-compatible
   * providers answer a non-streaming request with an SSE-framed body that
   * generateText cannot parse (see the custom-provider note).
   */
  async completeText(
    model: LanguageModel,
    prompt: string,
    provider?: LLMProvider,
  ): Promise<string> {
    const options = provider
      ? getReasoningProviderOptions(provider)
      : undefined;
    const result = streamText({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxRetries: 2,
      ...(options ? { providerOptions: options } : {}),
    });
    return (await result.text).trim();
  }

  /**
   * Titles the conversation once, while its title is still the placeholder
   * (the first question) set at creation. A titled or renamed conversation
   * keeps its title, so later turns and iterations cost no LLM call.
   */
  async generateTitle(
    conversationId: string,
    llmConfig: ResolvedLLMConfig,
  ): Promise<void> {
    // Iterations of one run finish before the title is written
    if (this.titling.has(conversationId)) return;
    this.titling.add(conversationId);
    try {
      const [conversation, messages] = await Promise.all([
        this.conversationRepository.findOne({
          where: { id: conversationId },
          select: ['id', 'title'],
        }),
        this.messageRepository.find({
          where: { conversationId },
          order: { createdAt: 'ASC' },
          take: 2,
          select: ['id', 'role', 'content'],
        }),
      ]);

      if (messages.length < 2) {
        return;
      }
      const question = messages.find((m) => m.role === MessageRole.USER);
      if (!question || conversation?.title !== question.content.slice(0, 500)) {
        return;
      }

      const conversationContent = messages
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n\n');

      const prompt = this.prompts.render('TITLE_GENERATE.md', {
        CONVERSATION_CONTENT: conversationContent,
      });

      const model = await this.llmConfigs.createLanguageModel(
        llmConfig,
        llmConfig.workspaceId,
      );

      const titleText = await this.completeText(
        model,
        prompt,
        llmConfig.provider,
      );

      const title = titleText.trim().slice(0, 500);

      if (title) {
        await this.conversationRepository.update(
          { id: conversationId },
          { title },
        );
      }
    } catch (error) {
      this.logger.error('Failed to generate title', error);
    } finally {
      this.titling.delete(conversationId);
    }
  }

  /**
   * Generates the goal of an Agent-mode turn from the user's question and
   * streams it to the client right away (like the title), so the pinned goal
   * appears before the agent has built its plan. Writes it to the
   * conversation metadata, where the pinned-goal prompt and later turns read
   * it; the agent's `formulate_plan` can still refine it. Fire-and-forget:
   * never blocks the run, and only one generation per conversation at a time.
   */
  async generateGoal(
    conversationId: string,
    llmConfig: ResolvedLLMConfig,
    question: string,
    /** Runs once the goal is stored: the caller streams it with the plan. */
    onGoal: (goal: string) => Promise<void>,
  ): Promise<void> {
    if (this.goaling.has(conversationId)) return;
    this.goaling.add(conversationId);
    try {
      const prompt = this.prompts.render('GOAL_GENERATE.md', {
        QUESTION: question.slice(0, 2000),
      });
      const model = await this.llmConfigs.createLanguageModel(
        llmConfig,
        llmConfig.workspaceId,
      );
      const text = await this.completeText(model, prompt, llmConfig.provider);
      // One line, no stray quotes, bounded like the stored column
      const goal = text
        .split('\n')[0]
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim()
        .slice(0, 500);
      if (!goal) return;

      // A plan the agent started meanwhile owns the goal: don't clobber it
      const active = await this.todoRepository.exists({
        where: { conversationId, status: 'in_progress' },
      });
      if (active) return;

      await updateConversationMetadata(
        this.conversationRepository.manager,
        conversationId,
        { goal },
      );
      await onGoal(goal);
    } catch (error) {
      this.logger.error('Failed to generate goal', error);
    } finally {
      this.goaling.delete(conversationId);
    }
  }
}
