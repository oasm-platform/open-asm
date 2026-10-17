import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  LanguageModel,
  StepResult,
  TextStreamPart,
  ToolSet,
  UIMessageChunk,
} from 'ai';
import { isStepCount, streamText, toUIMessageStream } from 'ai';
import * as fs from 'fs';
import * as Mustache from 'mustache';
import { EventEmitter } from 'node:events';
import * as path from 'path';
import { Repository } from 'typeorm';

import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import { WorkersService } from '@/modules/workers/workers.service';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import {
  APPROVAL_TIMEOUT_MS,
  AgentsApprovalsService,
  type ApprovalRequestEvent,
  type ApprovalResolvedEvent,
  type ApprovalSettings,
} from './agents.approvals';
import {
  AgentsConfigService,
  formatUserInstructions,
  type ResolvedLLMConfig,
  withAgentConfig,
  withoutDisabledTools,
} from './agents.config';
import { AgentsMcpService } from './agents.mcp';
import { AgentsMemoriesService } from './agents.memories';
import { AgentsModelsCatalogService } from './agents.models-catalog';
import {
  AgentsSubagentsService,
  SUBAGENT_MAX_ROUNDS_PER_TURN,
  SUBAGENT_WAIT_BUDGET_MS,
} from './agents.subagents';
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
import { getReasoningProviderOptions } from './llm-provider-supported';
import { ContextBudgetManager } from './shared/context-budget-manager';
import {
  type ConversationMetadata,
  type TurnStats,
  updateConversationMetadata,
} from './shared/conversation-metadata';
import { TokenCounter } from './shared/token-counter';
import {
  addSteps,
  addWait,
  emptyStats,
  finalizeStats,
  mergeStats,
  type StatsAccumulator,
} from './shared/turn-stats';

/**
 * Whether this run may plan. Only PLAN mode makes plans (`create`). After a
 * plan is approved the conversation runs in AUTO or MANUAL, which never plan,
 * but may still have to `finish` the steps that plan left; otherwise `off`.
 */
export type PlanningState = 'create' | 'finish' | 'off';

export function planningState(
  mode: AgentApprovalMode,
  todos: Pick<AgentTodoItem, 'status'>[],
): PlanningState {
  if (mode === AgentApprovalMode.PLAN) return 'create';
  const unfinished = todos.some(
    (t) => t.status === 'pending' || t.status === 'in_progress',
  );
  return unfinished ? 'finish' : 'off';
}

/** What is left of the plan tools while an approved plan is finished */
const FINISH_PLAN_TOOLS = new Set(['transition_step', 'scrap_plan']);

const PLAN_MODE_CONTEXT =
  '# PLAN MODE IS ON (overrides any instruction above about not planning)\n' +
  'The user turned on plan mode. For any request that needs one or more tool calls (reading assets, vulnerabilities, targets, issues, statistics, running commands, ...), ' +
  'your FIRST tool call must be formulate_plan with the steps you will take. ' +
  'The user reviews and approves the plan (choosing whether it runs automatically or asks per command) before any other tool can run; ' +
  'tool calls made before that are refused. Put data gathering into the plan steps instead of doing it first. ' +
  'Only a question you can fully answer from general knowledge, with no tool at all, needs no plan.';

const FINISH_PLAN_CONTEXT =
  '# AN APPROVED PLAN IS UNFINISHED\n' +
  'The user approved the CURRENT EXECUTION PLAN above earlier. Finish its remaining steps with transition_step, or call scrap_plan if the user wants something else. ' +
  'You cannot create a new plan or add steps: plan mode is off.';

export interface StreamMessageResult {
  stream: ReadableStream<UIMessageChunk>;
  conversationId: string;
  /** Resolves once the run has ended and saved its final state */
  settled?: Promise<void>;
}

/** Parameters for creating the merged ReadableStream result */
interface StreamCreationParams {
  aiStream: ReadableStream<UIMessageChunk>;
  conversationId: string;
  todosEmitter: EventEmitter;
  abortSignal?: AbortSignal;
  /** Resolves when critical onFinish DB writes (tool calls, parts, message content) complete */
  finishPromise: Promise<void>;
  /**
   * After finishPromise: saves the message as stopped/failed unless onEnd
   * already gave it its final state; resolves once that state is written
   */
  settle: (status: 'aborted' | 'error') => Promise<IterationOutcome>;
}

/**
 * How a streamText iteration ended: onEnd saved its answer, or it was
 * stopped/failed after some steps ran (their tools too), or before any
 */
type IterationOutcome = 'answer' | 'partial' | 'none';

/** Parameters for building streamText call options */
interface StreamTextOptions {
  llmConfig: ResolvedLLMConfig;
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
  /** Whether tool calls may block waiting for the user's approval */
  approvalMode?: AgentApprovalMode;
  /** Whether this run may make (or must finish) a plan */
  planning?: PlanningState;
  /** Receives the token/timing stats of this streamText call (also on abort) */
  onStats?: (stats: StatsAccumulator) => void;
}

/** A finished step: its content is kept in stream order */
export type PartsStep = Pick<StepResult<ToolSet>, 'content'>;

type ToolPartState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

/** One block of the step still streaming, in the order it arrived */
export type LiveSegment =
  | { type: 'reasoning' | 'text'; id: string; text: string }
  | {
      type: 'tool';
      toolCallId: string;
      toolName: string;
      state: ToolPartState;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };

/** The step still streaming: what has arrived of it so far */
export interface LiveStep {
  segments: LiveSegment[];
}

/** Interval between progress writes of a running answer */
const PROGRESS_FLUSH_MS = 1_000;

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Appends a text or reasoning delta to its block, opening a new block when another started */
export function appendLiveText(
  live: LiveStep,
  type: 'reasoning' | 'text',
  id: string,
  delta: string,
): void {
  const last = live.segments.at(-1);
  if (last && last.type === type && last.id === id) {
    last.text += delta;
  } else {
    live.segments.push({ type, id, text: delta });
  }
}

/** The live tool block of a call, if it started in this step */
export function findLiveTool(
  live: LiveStep,
  toolCallId: string,
): Extract<LiveSegment, { type: 'tool' }> | undefined {
  for (const segment of live.segments) {
    if (segment.type === 'tool' && segment.toolCallId === toolCallId) {
      return segment;
    }
  }
  return undefined;
}

/**
 * Builds the stored `parts` of an assistant message in stream order, the
 * same order the live stream renders. `live` appends the step still
 * streaming, so a client that polls mid-run sees the answer as it grows.
 */
export function buildMessageParts(
  steps: readonly PartsStep[],
  live?: LiveStep,
  fallbackReasoning = '',
): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  let hasReasoningPart = false;
  const pushText = (type: 'reasoning' | 'text', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    parts.push({ type, text: trimmed });
    if (type === 'reasoning') hasReasoningPart = true;
  };

  for (const step of steps) {
    const tools = new Map<string, Record<string, unknown>>();
    for (const content of step.content) {
      switch (content.type) {
        case 'reasoning':
        case 'text':
          pushText(content.type, content.text);
          break;
        case 'tool-call': {
          const part: Record<string, unknown> = {
            type: 'dynamic-tool',
            toolCallId: content.toolCallId,
            toolName: content.toolName,
            state: 'input-available',
            input: content.input,
            output: null,
          };
          tools.set(content.toolCallId, part);
          parts.push(part);
          break;
        }
        case 'tool-result': {
          const part = tools.get(content.toolCallId);
          if (part && !content.preliminary) {
            part.state = 'output-available';
            part.output = content.output ?? null;
          }
          break;
        }
        case 'tool-error': {
          const part = tools.get(content.toolCallId);
          if (part) {
            part.state = 'output-error';
            part.errorText = errorText(content.error);
          }
          break;
        }
      }
    }
  }

  for (const segment of live?.segments ?? []) {
    if (segment.type === 'tool') {
      parts.push({
        type: 'dynamic-tool',
        toolCallId: segment.toolCallId,
        toolName: segment.toolName,
        state: segment.state,
        input: segment.input,
        output: segment.output ?? null,
        ...(segment.errorText ? { errorText: segment.errorText } : {}),
      });
    } else {
      pushText(segment.type, segment.text);
    }
  }

  if (!hasReasoningPart && fallbackReasoning.trim()) {
    parts.unshift({ type: 'reasoning', text: fallbackReasoning.trim() });
  }
  return parts;
}

@Injectable()
export class AgentsCompletionsService {
  private readonly logger = new Logger(AgentsCompletionsService.name);

  /**
   * Active streaming runs by conversation id. A run outlives the HTTP request
   * that started it (so navigating away does not kill it); only an explicit
   * stop, or a newer run on the same conversation, aborts it.
   */
  private readonly activeRuns = new Map<string, AbortController>();

  /** Registers the run so a later stop can find it; supersedes any older run. */
  registerActiveRun(conversationId: string, controller: AbortController): void {
    const previous = this.activeRuns.get(conversationId);
    if (previous && previous !== controller) previous.abort();
    this.activeRuns.set(conversationId, controller);
  }

  /** Unregisters the run, but only if it is still the current one. */
  clearActiveRun(conversationId: string, controller: AbortController): void {
    if (this.activeRuns.get(conversationId) === controller) {
      this.activeRuns.delete(conversationId);
    }
  }

  /**
   * Aborts the active run of a conversation. Returns false if there is none.
   * The run stays registered (so `running` stays true) until it has saved
   * its stopped state; clearActiveRun removes it then.
   */
  stopRun(conversationId: string): boolean {
    const controller = this.activeRuns.get(conversationId);
    if (!controller || controller.signal.aborted) return false;
    controller.abort();
    return true;
  }

  /**
   * True while a run of the conversation is in progress, including the gaps
   * between continuation iterations where no message is 'streaming'.
   */
  isRunActive(conversationId: string): boolean {
    return this.activeRuns.has(conversationId);
  }

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
    private readonly workspaceEncryption: WorkspaceEncryptionService,
    private readonly approvals: AgentsApprovalsService,
    private readonly workersService: WorkersService,
    private readonly agentsConfig: AgentsConfigService,
    private readonly modelsCatalog: AgentsModelsCatalogService,
    private readonly subagents: AgentsSubagentsService,
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

  private async resolveLLMConfig(
    workspaceId: string,
    userId: string,
    provider?: string,
    model?: string,
  ): Promise<ResolvedLLMConfig> {
    const agentConfig = await this.agentsConfig.find(workspaceId, userId);

    if (model && provider) {
      const llmConfig = await this.llmConfigRepository.findOne({
        where: {
          workspaceId,
          userId,
          provider: provider as LLMProvider,
        },
      });
      if (llmConfig) return withAgentConfig(llmConfig, agentConfig);
    }

    const llmConfig = await this.agentsConfig.getDefaultLLMConfig(
      workspaceId,
      userId,
      agentConfig,
    );
    if (!llmConfig) {
      throw new BadRequestException(
        'No LLM provider connected. Please connect a provider first.',
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

  private createLanguageModel(
    config: AgentLLMConfig,
    workspaceId: string,
  ): Promise<LanguageModel> {
    return this.agentsConfig.createLanguageModel(config, workspaceId);
  }

  /**
   * One-shot text completion for background helpers (title, summary, vuln
   * analysis). Uses streamText, not generateText: some OpenAI-compatible
   * providers answer a non-streaming request with an SSE-framed body that
   * generateText cannot parse (see the custom-provider note).
   */
  private async completeText(
    model: LanguageModel,
    prompt: string,
    provider?: LLMProvider,
  ): Promise<string> {
    const options = provider ? getReasoningProviderOptions(provider) : undefined;
    const result = streamText({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxRetries: 2,
      ...(options ? { providerOptions: options } : {}),
    });
    return (await result.text).trim();
  }

  private async generateTitle(
    conversationId: string,
    llmConfig: ResolvedLLMConfig,
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

      const model = await this.createLanguageModel(
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
    }
  }

  private async handleStreamFinish(
    assistantMsgId: string,
    conversationId: string,
    accumulatedText: string,
    accumulatedReasoning: string,
    llmConfig: ResolvedLLMConfig,
    assistantMsgMetadata: Record<string, unknown> | undefined,
    stats?: TurnStats,
  ): Promise<void> {
    try {
      await this.messageRepository.update(
        { id: assistantMsgId },
        {
          content: accumulatedText,
          metadata: {
            ...assistantMsgMetadata,
            ...(stats ? { stats } : {}),
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
   * Auto-completes todos the LLM left "in_progress" after producing a
   * response — a safety net for when it forgets transition_step(id,
   * "completed") on the last step. Skipped while pending steps remain: the
   * run stopped early then, and marking unfinished work as done would lie to
   * the user and make the next turn skip it.
   */
  private async autoCompleteStuckTodos(conversationId: string): Promise<void> {
    try {
      const todos = await this.todoRepository.find({
        where: { conversationId },
      });
      if (todos.some((t) => t.status === 'pending')) return;
      const stuckTodos = todos.filter((t) => t.status === 'in_progress');

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
    userId: string,
  ): Promise<string> {
    try {
      const llmConfig = await this.resolveLLMConfig(workspaceId, userId);

      const prompt = this.getPrompt('VUL_ANALYZE.md', {
        VULNERABILITY_JSON: vulnerabilityJson,
      });

      const model = await this.createLanguageModel(llmConfig, workspaceId);
      const tools = withoutDisabledTools(
        this.agentTool.getTools(workspaceId, AgentMode.AGENT),
        await this.agentsConfig.find(workspaceId, userId),
      );

      let accumulatedText = '';

      const result = streamText({
        model,
        messages: [{ role: 'user', content: prompt }],
        tools,
        stopWhen: isStepCount(20),
        ...(() => {
          const opts = getReasoningProviderOptions(llmConfig.provider);
          return opts ? { providerOptions: opts } : {};
        })(),
        onChunk: ({ chunk }: { chunk: TextStreamPart<ToolSet> }) => {
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
   * - If dto.conversationId exists in DB and belongs to the current member → reuse it
   * - If dto.conversationId exists in DB but belongs to another member → throw (no leak, no takeover)
   * - If dto.conversationId is provided but not found yet → create a new conversation with that ID
   * - If no conversationId → create a brand new conversation
   */
  private async getOrCreateConversation(
    dto: SendMessageDto,
    workspaceId: string,
    userId: string,
  ): Promise<AgentConversation> {
    if (dto.conversationId) {
      // Find by id + workspaceId only (not scoped to the member) so we can
      // distinguish "exists but owned by another member" from "not found yet"
      const existing = await this.conversationRepository.findOne({
        where: { id: dto.conversationId, workspaceId },
      });

      if (existing) {
        if (existing.createdBy === userId) {
          return existing; // Return existing conversation
        }
        // Conversation belongs to another member — never reuse or expose it
        throw new NotFoundException('Conversation not found');
      }
    }

    // No conversationId provided, or the provided one does not exist yet —
    // create a new conversation (reusing the client-generated ID when given)
    const llmConfig = await this.resolveLLMConfig(
      workspaceId,
      userId,
      dto.provider,
      dto.model,
    );
    if (
      dto.workerId &&
      !(await this.workersService.isAgentWorkerForWorkspace(
        dto.workerId,
        workspaceId,
      ))
    ) {
      throw new BadRequestException(
        'Worker is not available to agents in this workspace',
      );
    }
    const agentConfig = await this.agentsConfig.find(workspaceId, userId);
    const newConversation = this.conversationRepository.create({
      ...(dto.conversationId ? { id: dto.conversationId } : {}),
      workspaceId,
      llmConfigId: llmConfig.id,
      title: dto.question.slice(0, 500),
      createdBy: userId,
      agentMode: dto.agentMode ?? agentConfig?.defaultAgentMode ?? undefined,
      approvalMode:
        dto.approvalMode ??
        agentConfig?.defaultApprovalMode ??
        AgentApprovalMode.MANUAL,
      workerId: dto.workerId,
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
    userId: string,
  ): Promise<ResolvedLLMConfig> {
    // Get the base config from the conversation
    let llmConfig = await this.llmConfigRepository.findOne({
      where: { id: conversation.llmConfigId, workspaceId, userId },
    });

    if (!llmConfig) {
      throw new NotFoundException('LLM config not found');
    }

    // If user switched to a different provider, resolve the correct config
    if (dto.provider && dto.provider !== llmConfig.provider) {
      const switchedConfig = await this.llmConfigRepository.findOne({
        where: { workspaceId, userId, provider: dto.provider },
      });
      if (switchedConfig) {
        llmConfig = switchedConfig;
      }
    }

    // If user changed model within the same provider, override in memory only
    // (Avoids writing to DB which would affect other conversations).
    // Otherwise the default connection runs the agent's default model.
    const agentConfig = await this.agentsConfig.find(workspaceId, userId);
    const defaultRef = agentConfig?.modelsConfig.default;
    const model =
      dto.model && dto.provider === llmConfig.provider
        ? dto.model
        : defaultRef?.llmConfigId === llmConfig.id
          ? defaultRef.model
          : llmConfig.model;

    return withAgentConfig(llmConfig, agentConfig, model);
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
    llmConfig: ResolvedLLMConfig,
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
    llmConfig: ResolvedLLMConfig,
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

      const model = await this.createLanguageModel(
        llmConfig,
        llmConfig.workspaceId,
      );

      const cleanedSummary = await this.completeText(
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
    llmConfig: ResolvedLLMConfig,
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
   * Gives a message still marked 'streaming' its final status. Only touches
   * that status, so a message that did finish keeps what onEnd wrote.
   */
  private async settleStreamingMessage(
    messageId: string,
    status: 'aborted' | 'error',
  ): Promise<void> {
    try {
      await this.messageRepository
        .createQueryBuilder()
        .update()
        .set({
          metadata: () =>
            `jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', to_jsonb(CAST(:status AS text)))`,
        })
        .setParameter('status', status)
        .where('id = :id', { id: messageId })
        .andWhere(`metadata->>'status' = 'streaming'`)
        .execute();
    } catch (err) {
      this.logger.error('Error settling streaming message', err);
    }
  }

  /** Subagents run only in AGENT mode; ASK answers by itself. */
  private async getSubagentsPrompt(
    agentMode: AgentMode,
    workspaceId: string,
    userId: string,
  ): Promise<string> {
    if (agentMode !== AgentMode.AGENT) return '';
    return this.subagents.buildSubagentsPrompt(workspaceId, userId);
  }

  /**
   * dispatch_subagent / get_subagent_result, AGENT mode only. They only
   * read or queue, but stay gated so PLAN mode blocks them.
   */
  private getSubagentTools(
    agentMode: AgentMode,
    ctx: {
      conversationId: string;
      workspaceId: string;
      userId: string;
      approval: ApprovalSettings;
      todosEmitter: EventEmitter;
      onResultRead: (id: string) => void;
    },
  ): ToolSet {
    if (agentMode !== AgentMode.AGENT) return {};
    return this.agentTool.gateTools(
      this.subagents.createTools({
        conversationId: ctx.conversationId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        onResultRead: ctx.onResultRead,
      }),
      ctx.workspaceId,
      ctx.conversationId,
      ctx.approval,
      ctx.todosEmitter,
      true,
    ) as ToolSet;
  }

  /**
   * Plan tools for this run: none when planning is off, and only the tools
   * that finish or drop an approved plan when one is left over.
   */
  private getPlanTools(
    planning: PlanningState,
    conversationId: string,
    emitter: EventEmitter,
    plan: { workspaceId: string; approval: ApprovalSettings },
  ): ToolSet {
    if (planning === 'off') return {};
    const tools = this.agentTool.getTodoTools(
      conversationId,
      emitter,
      plan,
    ) as ToolSet;
    if (planning === 'create') return tools;
    return Object.fromEntries(
      Object.entries(tools).filter(([name]) => FINISH_PLAN_TOOLS.has(name)),
    );
  }

  private async loadTodoItems(
    conversationId: string,
  ): Promise<AgentTodoItem[]> {
    const entities = await this.todoRepository.find({
      where: { conversationId },
      order: { sortOrder: 'ASC' },
    });
    return entities.map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status,
      sortOrder: t.sortOrder,
      updatedAt: t.updatedAt.toISOString(),
    }));
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

    // Fetch STM, LTM and the user's agent config concurrently
    const [stmContext, ltmContext, agentConfig] = await Promise.all([
      this.agentsMemories.stmFormatForPrompt(conversation.id),
      userId
        ? this.agentsMemories.ltmFormatForPrompt(workspaceId, userId)
        : Promise.resolve(''),
      userId
        ? this.agentsConfig.find(workspaceId, userId)
        : Promise.resolve(null),
    ]);
    const userContext = formatUserInstructions(agentConfig);

    const todos = await this.loadTodoItems(conversation.id);
    const planning = planningState(conversation.approvalMode, todos);
    // AUTO and MANUAL never plan, so they get no plan prompt and no old plan.
    // Plan mode applies in every agent mode: it overrides ASK.md's "answer
    // directly", since the user explicitly asked to see a plan first
    const todosContext = planning === 'off' ? '' : formatTodosToPrompt(todos);
    const planContext =
      planning === 'off'
        ? ''
        : [
            this.getPrompt('PLAN.md'),
            planning === 'create' ? PLAN_MODE_CONTEXT : FINISH_PLAN_CONTEXT,
          ].join('\n\n');

    // Inject conversation summary if available (from auto-compaction)
    const summaryContext = conversation.summary
      ? `[PREVIOUS CONVERSATION SUMMARY]:\n${conversation.summary}`
      : '';

    // Combine all context parts, filtering out empty ones
    return [
      modePrompt,
      systemPrompt,
      userContext,
      summaryContext,
      currentTimeContext,
      ltmContext,
      stmContext,
      todosContext,
      planContext,
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
   * Priority: model ref contextWindow (user override) > models.dev catalog
   * > default (128k).
   */
  private getModelContextWindow(llmConfig: ResolvedLLMConfig): number {
    return this.modelsCatalog.resolveWindow(llmConfig).tokens;
  }

  /**
   * Saves the model, context usage and stats of a finished turn on the
   * conversation and adds its tokens/cost to the conversation totals.
   */
  private persistTurnMetadata(
    conversationId: string,
    llmConfig: ResolvedLLMConfig,
    acc: StatsAccumulator,
  ): Promise<ConversationMetadata | null> {
    const lastTurn = finalizeStats(acc, {
      cost: this.modelsCatalog.costOf(llmConfig.provider, llmConfig.model),
    });
    return updateConversationMetadata(
      this.conversationRepository.manager,
      conversationId,
      {
        ...this.modelMetadata(llmConfig),
        contextUsedTokens: acc.lastContextTokens,
        lastTurn,
      },
      {
        inputTokens: lastTurn.inputTokens,
        outputTokens: lastTurn.outputTokens,
        costUsd: lastTurn.costUsd,
        countTurn: true,
      },
    );
  }

  /** Model and context-window fields of the conversation metadata. */
  private modelMetadata(
    llmConfig: ResolvedLLMConfig,
  ): Partial<ConversationMetadata> {
    const window = this.modelsCatalog.resolveWindow(llmConfig);
    return {
      model: llmConfig.model,
      provider: llmConfig.provider,
      llmConfigId: llmConfig.id,
      contextWindow: window.tokens,
      contextWindowSource: window.source,
      catalogEstimated: window.estimated,
    };
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
    llmConfig: ResolvedLLMConfig,
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
      const model = await this.createLanguageModel(
        llmConfig,
        llmConfig.workspaceId,
      );

      // Generate the summary
      const cleanedSummary = await this.completeText(
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
  private async handlePostStreamCompaction(
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

    // Progress of the running answer, saved on the placeholder message so a
    // client that left and came back (and lost the SSE stream) sees it grow.
    // Only `parts` is written here; content and status stay with onEnd.
    const completedSteps: StepResult<ToolSet>[] = [];
    let live: LiveStep = { segments: [] };
    let progressDirty = false;
    let progressClosed = false;
    let progressSaved = false;
    let progressTimer: NodeJS.Timeout | undefined;
    // Chains the writes so they land in order
    let progressWrite: Promise<void> = Promise.resolve();

    const flushProgress = (): Promise<void> => {
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = undefined;
      }
      if (progressClosed || !progressDirty) return progressWrite;
      progressDirty = false;
      // Snapshot now: the live step keeps changing while the write is queued
      const parts = buildMessageParts(completedSteps, live);
      if (parts.length === 0) return progressWrite;
      progressWrite = progressWrite
        .then(async () => {
          // A write queued just before the final one must not overwrite it
          if (progressClosed) return;
          await this.messageRepository.update(
            { id: assistantMessageId },
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            { parts: parts as any },
          );
          progressSaved = true;
        })
        .catch((err) =>
          this.logger.warn(`Error saving progress parts: ${String(err)}`),
        );
      return progressWrite;
    };
    const scheduleProgress = () => {
      progressDirty = true;
      if (progressTimer || progressClosed) return;
      progressTimer = setTimeout(() => void flushProgress(), PROGRESS_FLUSH_MS);
      progressTimer.unref?.();
    };
    /** Stops progress writes and waits for the one in flight, so the final write lands last. */
    const closeProgress = (): Promise<void> => {
      progressClosed = true;
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = undefined;
      }
      return progressWrite;
    };

    // The write that gives this message its final state (onEnd's, or a
    // stopped/failed one); set once, so a late callback cannot overwrite it
    let finalWrite: Promise<void> | undefined;
    // Token stats are reported once, by whichever path ends the iteration
    let statsReported = false;
    /** Saves the answer so far as stopped or failed: unfinished tools end as errors */
    const saveStopped = async (status: 'aborted' | 'error'): Promise<void> => {
      for (const segment of live.segments) {
        if (
          segment.type === 'tool' &&
          (segment.state === 'input-streaming' ||
            segment.state === 'input-available')
        ) {
          segment.state = 'output-error';
          segment.errorText = status === 'aborted' ? 'Stopped' : 'Failed';
        }
      }
      const parts = buildMessageParts(
        completedSteps,
        live,
        accumulatedReasoning,
      );
      await closeProgress();
      try {
        await this.messageRepository.update(
          { id: assistantMessageId },
          {
            // Keep what was generated so a stopped turn is not lost
            content: accumulatedText,
            ...(parts.length > 0 || progressSaved
              ? // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                { parts: parts as any }
              : {}),
            metadata: { ...assistantMessageMetadata, status },
          },
        );
      } catch (err) {
        this.logger.error(`Error saving ${status} message`, err);
      }
    };
    const writeStopped = (status: 'aborted' | 'error'): Promise<void> =>
      (finalWrite ??= saveStopped(status));

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
        settle: async (status) => {
          await this.settleStreamingMessage(assistantMessageId, status);
          return 'none';
        },
      };
    }

    // Determine max output tokens based on agent mode and LLM config
    // AGENT mode needs more tokens for multi-step tool execution
    const maxOutputTokens =
      llmConfig.maxOutputTokens ??
      (options.agentMode === AgentMode.AGENT ? 32768 : undefined);

    const startedAt = Date.now();

    // streamText calls onAbort instead of onEnd when aborted, and neither
    // when the consumer just cancels: never leave the loop awaiting forever
    abortSignal?.addEventListener(
      'abort',
      () => {
        void closeProgress();
        resolveFinish?.();
      },
      { once: true },
    );
    const reportStats = (steps: Parameters<typeof addSteps>[1]) => {
      const stats = addSteps(emptyStats(startedAt), steps);
      try {
        options.onStats?.(stats);
      } catch (err) {
        this.logger.error('Error reporting stream stats', err);
      }
      return stats;
    };

    // Invoke the AI SDK streamText with all callbacks
    const result = streamText({
      model,
      // System context passed via dedicated option (avoids prompt injection risk)
      system: contextParts.join('\n\n'),
      messages: modelMessages,
      // History may contain persisted system-role messages; v7 rejects them by default
      allowSystemInMessages: true,
      // Retry transient provider errors (429 rate-limit, 500/502/503 server errors)
      maxRetries: 3,
      // Detect stuck streams: abort if no chunk arrives within 30 seconds.
      // A tool call may sit waiting for the user's approval (in any agent
      // mode unless approvals are off), which emits no chunks, so allow for
      // the approval window.
      timeout: {
        chunkMs:
          options.agentMode === AgentMode.AGENT ||
          options.approvalMode !== AgentApprovalMode.AUTO
            ? APPROVAL_TIMEOUT_MS + 60_000
            : 30_000,
      },
      // Only include tools if available (models without tool support will error here)
      ...(tools
        ? {
            tools,
            stopWhen: isStepCount(llmConfig.maxSteps ?? 20),
          }
        : {}),
      // Enable reasoning/thinking via provider-specific options
      ...(() => {
        const opts = getReasoningProviderOptions(llmConfig.provider);
        return opts ? { providerOptions: opts } : {};
      })(),
      // AGENT mode needs more output tokens for multi-step execution
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      // Accumulate text-delta and reasoning chunks as they arrive, and track
      // the live step for progress writes. Stays synchronous: the SDK pauses
      // the stream until onChunk resolves, so DB work is only scheduled here.
      onChunk: ({ chunk }) => {
        switch (chunk.type) {
          case 'text-delta':
            accumulatedText += chunk.text;
            appendLiveText(live, 'text', chunk.id, chunk.text);
            break;
          case 'reasoning-delta':
            accumulatedReasoning += chunk.text;
            appendLiveText(live, 'reasoning', chunk.id, chunk.text);
            break;
          case 'tool-input-start':
            live.segments.push({
              type: 'tool',
              toolCallId: chunk.id,
              toolName: chunk.toolName,
              state: 'input-streaming',
            });
            break;
          case 'tool-call': {
            // Emitted before the tool runs, so a long or approval-gated
            // tool shows as executing
            const tool = findLiveTool(live, chunk.toolCallId);
            if (tool) {
              tool.state = 'input-available';
              tool.input = chunk.input;
            } else {
              live.segments.push({
                type: 'tool',
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                state: 'input-available',
                input: chunk.input,
              });
            }
            break;
          }
          case 'tool-result': {
            if (chunk.preliminary) return;
            const tool = findLiveTool(live, chunk.toolCallId);
            if (!tool) return;
            tool.state = 'output-available';
            tool.output = chunk.output;
            break;
          }
          case 'tool-error': {
            const tool = findLiveTool(live, chunk.toolCallId);
            if (!tool) return;
            tool.state = 'output-error';
            tool.errorText =
              chunk.error instanceof Error
                ? chunk.error.message
                : String(chunk.error);
            break;
          }
          default:
            return;
        }
        scheduleProgress();
      },
      // A step ended (its tool results are in): save it right away
      onStepEnd: (step) => {
        completedSteps.push(step);
        live = { segments: [] };
        progressDirty = true;
        void flushProgress();
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
      // Tokens were spent even when the run was aborted (onEnd does not run)
      onAbort: (event) => {
        if (!statsReported) {
          statsReported = true;
          reportStats(event.steps);
        }
        void writeStopped('aborted');
        resolveFinish?.();
      },
      // When streaming completes, persist accumulated text to DB
      // persist tool call data (for history rendering on page reload),
      // auto-complete stuck todos, and trigger compaction check
      onEnd: (event) => {
        const isAborted = () => abortSignal?.aborted ?? false;

        this.logger.log(
          `[Agent] Stream ${conversationId} finished: ` +
            `finishReason=${event.finishReason}, ` +
            `steps=${event.steps.length}, ` +
            `toolCalls=${event.toolCalls.length}, ` +
            `agentMode=${options.agentMode ?? 'unknown'}`,
        );

        // Stopped or failed already (the loop settled it): keep that state
        if (finalWrite) {
          resolveFinish?.();
          return;
        }

        statsReported = true;
        const messageStats = finalizeStats(reportStats(event.steps), {
          cost: this.modelsCatalog.costOf(llmConfig.provider, llmConfig.model),
        });

        if (isAborted()) {
          void writeStopped('aborted');
          resolveFinish?.();
          return;
        }

        // Critical DB writes are awaited internally and resolve finishPromise
        // when complete. Non-critical operations remain fire-and-forget.
        finalWrite = (async () => {
          // The final parts write below must not be overtaken by a progress write
          await closeProgress();

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
            await saveStopped('aborted');
            return;
          }

          // Build parts array for frontend rendering
          try {
            const parts = buildMessageParts(
              event.steps,
              undefined,
              accumulatedReasoning,
            );
            // Also replace progress parts that the final answer no longer has
            if (parts.length > 0 || progressSaved) {
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
            messageStats,
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

    // When the provider fails before any step finishes (bad key, context too
    // long, 5xx after retries) the SDK runs neither onEnd nor onAbort; it
    // only rejects the result promises. Don't leave the loop awaiting forever.
    Promise.resolve(result.steps).then(undefined, () => resolveFinish?.());

    // Convert the result stream to a UIMessageStream consumable by the frontend
    const aiStream = toUIMessageStream({ stream: result.stream, tools });

    return {
      aiStream,
      conversationId,
      todosEmitter,
      finishPromise,
      // After finishPromise: a message that got no final state from onEnd
      // (stopped, or the provider failed) is saved as such
      settle: async (status) => {
        if (finalWrite) {
          await finalWrite;
          return 'answer';
        }
        // Tokens of the steps that ran were spent too
        if (!statsReported) {
          statsReported = true;
          reportStats(completedSteps);
        }
        await writeStopped(status);
        return completedSteps.length > 0 ? 'partial' : 'none';
      },
    };
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
      /** Subagent results injected into the first prompt (released if it fails) */
      deliveredSubagentIds?: string[];
      /** The formatted text of those results */
      deliveredSubagentResults?: string;
      /** Filled by the loop so the subagent tools can report reads */
      subagentHooks?: { onResultRead?: (id: string) => void };
      /** Called once the run has ended and saved its final state */
      onSettled?: () => void;
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
    const MAX_STALLED_ITERATIONS = 2;
    const MAX_CONSECUTIVE_ERRORS = 3;
    const isAgentMode = agentMode === AgentMode.AGENT;
    // Keep running an approved plan to its end, in Ask mode too
    const continuesPlan =
      isAgentMode ||
      options.approvalMode === AgentApprovalMode.PLAN ||
      options.planning === 'finish';
    let stalledIterations = 0;
    let consecutiveErrors = 0;
    let lastFingerprint: string | undefined;

    const planFingerprint = (todos: AgentTodoItem[]) =>
      todos.map((t) => `${t.id}:${t.status}`).join(',');

    const rebuildContext = async (
      conversation: AgentConversation,
    ): Promise<string[]> => {
      const parts = await this.buildSystemContext(
        conversation,
        workspaceId,
        agentMode || AgentMode.ASK,
        userId,
      );
      if (skillsContext) parts.push(skillsContext);
      return parts;
    };

    let currentModelMessages = [...options.modelMessages];
    let currentAssistantMessageId = options.assistantMessageId;
    // Settles the iteration in progress if the loop ends inside it
    let settleIteration:
      | ((status: 'aborted' | 'error') => Promise<IterationOutcome>)
      | undefined;
    let currentAssistantMetadata = options.assistantMessageMetadata;
    let currentContextParts = [...options.contextParts];

    // Token/timing stats of the whole user turn (all iterations)
    let turnAcc = emptyStats(Date.now());
    // Subagent results in the prompt of the iteration being run; released
    // back to "undelivered" if that iteration fails or is aborted
    let pendingDeliveryIds = [...(options.deliveredSubagentIds ?? [])];
    let subagentRounds = 0;
    let subagentWaitBudgetMs = SUBAGENT_WAIT_BUDGET_MS;
    // Only subagents dispatched in this turn are waited for; results of
    // earlier ones are still handed back, just never waited on
    const turnStartedAt = new Date();
    // Results handed back this turn. Prompts are rebuilt from the DB between
    // iterations, where these (memory-only) messages do not exist, so every
    // follow-up repeats them
    const deliveredResults: string[] = options.deliveredSubagentResults
      ? [options.deliveredSubagentResults]
      : [];
    // A result read with get_subagent_result belongs to the running iteration
    if (options.subagentHooks) {
      options.subagentHooks.onResultRead = (id: string) => {
        if (!pendingDeliveryIds.includes(id)) pendingDeliveryIds.push(id);
      };
    }

    const releasePendingDelivery = async () => {
      if (pendingDeliveryIds.length === 0) return;
      const ids = pendingDeliveryIds;
      pendingDeliveryIds = [];
      await this.subagents
        .releaseDelivery(ids)
        .catch((err) =>
          this.logger.error('Failed to release subagent delivery', err),
        );
    };

    const runLoop = async (
      controller: ReadableStreamDefaultController<UIMessageChunk>,
    ) => {
      let controllerClosed = false;

      /**
       * Waits (bounded) for this conversation's background subagents and
       * returns their results as a follow-up prompt, or null when there is
       * nothing to wait for.
       */
      const awaitSubagents = async (): Promise<{
        message: string;
        ids: string[];
      } | null> => {
        if (
          subagentRounds >= SUBAGENT_MAX_ROUNDS_PER_TURN ||
          subagentWaitBudgetMs <= 0
        ) {
          return null;
        }
        const [active, undelivered] = await Promise.all([
          this.subagents.hasActive(conversationId, turnStartedAt),
          this.subagents.countUndelivered(conversationId),
        ]);
        if (!active && undelivered === 0) return null;

        const waitStart = Date.now();
        const outcome = active
          ? await this.subagents.waitForSettled(
              conversationId,
              subagentWaitBudgetMs,
              abortSignal,
              turnStartedAt,
            )
          : 'settled';
        const waited = Date.now() - waitStart;
        subagentWaitBudgetMs -= waited;
        turnAcc = addWait(turnAcc, waited);
        if (outcome === 'aborted' || abortSignal?.aborted || controllerClosed) {
          return null;
        }

        // On timeout, whatever finished is delivered now; the rest is
        // delivered at the start of the next message
        const rows = await this.subagents.takeUndelivered(conversationId);
        if (rows.length === 0) return null;
        subagentRounds++;
        return {
          message: this.subagents.formatResultsMessage(rows),
          ids: rows.map((r) => r.id),
        };
      };

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
        // Transient: a non-transient data chunk is appended to the message
        // parts and the client re-clones the whole message per chunk, so a
        // long output (thousands of chunks) froze the chat.
        controller.enqueue({
          type: 'data-remote-execute-output',
          data,
          transient: true,
        } as unknown as UIMessageChunk);
      };
      todosEmitter.on('remote-execute-output', onRemoteExecuteOutput);

      // Subscribe to approval-required events (human-in-the-loop dialog)
      const onApprovalRequired = (data: ApprovalRequestEvent) => {
        if (controllerClosed) return;
        controller.enqueue({
          type: 'data-approval-required',
          data,
        } as unknown as UIMessageChunk);
      };
      todosEmitter.on('approval-required', onApprovalRequired);

      // A prompt no longer needs an answer (allowed by "allow all" or
      // "allow tool", timed out, ...): the UI drops it from its queue
      const onApprovalResolved = (data: ApprovalResolvedEvent) => {
        if (controllerClosed) return;
        controller.enqueue({
          type: 'data-approval-resolved',
          data,
        } as unknown as UIMessageChunk);
      };
      todosEmitter.on('approval-resolved', onApprovalResolved);

      // The user approved a plan and picked how it runs: sync the selector
      const onApprovalModeChanged = (data: { mode: AgentApprovalMode }) => {
        if (controllerClosed) return;
        controller.enqueue({
          type: 'data-approval-mode-changed',
          data,
        } as unknown as UIMessageChunk);
      };
      todosEmitter.on('approval-mode-changed', onApprovalModeChanged);

      // Subscribe to stream-error events (provider errors propagated to frontend)
      const onStreamError = (data: { message: string }) => {
        if (controllerClosed) return;
        controller.enqueue({
          type: 'error',
          error: data,
        } as unknown as UIMessageChunk);
      };
      todosEmitter.on('stream-error', onStreamError);

      // Background subagent status changes for this conversation
      const unsubscribeSubagents = this.subagents.subscribe(
        conversationId,
        (subagents) => {
          if (controllerClosed) return;
          controller.enqueue({
            type: 'data-subagents-updated',
            data: { subagents },
            transient: true,
          } as unknown as UIMessageChunk);
        },
      );

      // Emit initial conversation-created event
      controller.enqueue({
        type: 'data-conversation-created',
        data: { conversationId },
      });

      try {
        if (continuesPlan) {
          lastFingerprint = planFingerprint(
            await this.loadTodoItems(conversationId),
          );
        }

        for (
          let iteration = 0;
          iteration < MAX_SAFETY_ITERATIONS;
          iteration++
        ) {
          if (abortSignal?.aborted || controllerClosed) break;

          // Mid-loop compaction: check budget before each iteration
          if (continuesPlan && iteration > 0) {
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
                currentContextParts = await rebuildContext(
                  postCompactConversation,
                );
              }
            }
          }

          try {
            // Execute a single streamText iteration
            const { aiStream, finishPromise, settle } = this.executeStreamText({
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
              approvalMode: options.approvalMode,
              onStats: (stats) => {
                turnAcc = mergeStats(turnAcc, stats);
              },
            });
            settleIteration = settle;

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
            // Stopped, or the provider failed before onEnd: give the
            // message its final state
            const outcome = await settle(
              abortSignal?.aborted ? 'aborted' : 'error',
            );
            settleIteration = undefined;
            if (!abortSignal?.aborted && !controllerClosed) {
              // Nothing ran yet: retry it like any other failure
              if (outcome === 'none') {
                throw new Error('The model call ended without an answer');
              }
              // Failed after some steps ran: retrying from scratch would run
              // their tools again, so keep the partial answer and stop
              if (outcome === 'partial') break;
            }
            consecutiveErrors = 0;
          } catch (iterationError) {
            this.logger.error(
              `[Continuation] Error in iteration ${iteration} for ${conversationId}`,
              iterationError,
            );
            // Injected results stay pending: the retry re-sends the same
            // prompt, and `finally` releases them if no retry succeeds
            // Don't break on non-fatal errors — try next iteration
            // Only break if abort signal fired or controller is closed
            if (abortSignal?.aborted || controllerClosed) break;
            // The stream failed mid-iteration: keep what its steps did rather
            // than retry from scratch and run their tools again
            if (settleIteration) {
              const outcome = await settleIteration('error');
              settleIteration = undefined;
              if (outcome !== 'none') break;
            }
            // Reset in_progress todos back to pending so the next iteration
            // can re-attempt them. Await to ensure DB is updated before
            // the loop reads stale data.
            const updatedTodos = await this.resetTodosOnError(conversationId);
            todosEmitter.emit('todos-updated', updatedTodos);
            if (++consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
            continue;
          }

          if (abortSignal?.aborted || controllerClosed) break;
          // This iteration's prompt consumed the injected subagent results
          pendingDeliveryIds = [];

          // Auto-continue while a plan has pending steps (Agent or Plan
          // mode), or once background subagents hand their results back
          const todos = continuesPlan
            ? await this.loadTodoItems(conversationId)
            : [];
          const pendingSteps = todos.filter(
            (t) => t.status === 'pending' || t.status === 'in_progress',
          );

          // Instruction for the next iteration and results handed back now
          let followUp = '';
          let newResults: string | undefined;
          if (pendingSteps.length === 0) {
            const delivered = await awaitSubagents();
            if (!delivered) break;
            newResults = delivered.message;
            pendingDeliveryIds = delivered.ids;
          } else {
            // Stop when the plan stops moving: the model is waiting on the
            // user, keeps failing, or ignores the plan. Without this a stuck
            // run re-prompts until MAX_SAFETY_ITERATIONS, burning tokens.
            const fingerprint = planFingerprint(todos);
            stalledIterations =
              fingerprint === lastFingerprint ? stalledIterations + 1 : 0;
            lastFingerprint = fingerprint;
            if (stalledIterations >= MAX_STALLED_ITERATIONS) {
              // A plan waiting on its subagents is not stuck
              const delivered = await awaitSubagents();
              if (!delivered) {
                this.logger.warn(
                  `[Auto-continuation] Plan made no progress in ${stalledIterations} iterations for ${conversationId}; stopping`,
                );
                break;
              }
              stalledIterations = 0;
              newResults = delivered.message;
              pendingDeliveryIds = delivered.ids;
            } else {
              // Synthesized "continue" message (NOT saved to DB — memory only)
              // Include specific pending step IDs to help LLM resume correctly
              const pendingList = pendingSteps
                .map(
                  (t, i) =>
                    `${i + 1}. [${t.status.toUpperCase()}] ${t.content} (id: ${t.id})`,
                )
                .join('\n');
              followUp =
                `Continue executing the pending plan steps. Here are the remaining steps:\n${pendingList}\n\n` +
                'Start with the FIRST pending step. Do NOT create new steps. Do NOT skip steps. Execute them in order until all are done.';
              // Hand back subagents that finished meanwhile, without waiting
              const ready = await this.subagents.takeUndelivered(
                conversationId,
              );
              if (ready.length > 0) {
                newResults = this.subagents.formatResultsMessage(ready);
                pendingDeliveryIds = ready.map((r) => r.id);
              }
            }
          }

          const conversation = await this.conversationRepository.findOne({
            where: { id: conversationId },
          });

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
          currentModelMessages.push({
            role: 'user' as const,
            content: [...deliveredResults, newResults, followUp]
              .filter(Boolean)
              .join('\n\n---\n\n'),
          });
          if (newResults) deliveredResults.push(newResults);

          // Create a new assistant message in DB for the next iteration
          const newAssistant = await this.saveAssistantMessage(
            conversationId,
            llmConfig,
          );
          currentAssistantMessageId = newAssistant.id;
          currentAssistantMetadata = newAssistant.metadata;

          // Rebuild context to reflect updated todos
          if (conversation) {
            currentContextParts = await rebuildContext(conversation);
          }

          this.logger.log(
            `[Auto-continuation] Iteration ${iteration + 1} for ${conversationId}: ` +
              `${pendingSteps.length} steps remaining`,
          );
        }
      } finally {
        unsubscribeSubagents();
        // A placeholder no iteration finished (stopped mid-iteration or
        // between iterations, or every retry failed) must not stay
        // 'streaming'
        const endStatus = abortSignal?.aborted ? 'aborted' : 'error';
        await settleIteration?.(endStatus);
        await this.settleStreamingMessage(currentAssistantMessageId, endStatus);
        // Results injected into a prompt that never completed go back to
        // the queue so the next message delivers them
        await releasePendingDelivery();
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onAbort);
        }
        todosEmitter.off('todos-updated', onTodosUpdated);
        todosEmitter.off('remote-execute-output', onRemoteExecuteOutput);
        todosEmitter.off('approval-required', onApprovalRequired);
        todosEmitter.off('approval-resolved', onApprovalResolved);
        todosEmitter.off('approval-mode-changed', onApprovalModeChanged);
        todosEmitter.off('stream-error', onStreamError);

        // Auto-complete stuck in_progress todos AFTER all continuation
        // iterations are done. This prevents the race condition where
        // autoCompleteStuckTodos (previously called per-iteration in
        // onFinish) would mark todos as completed before the continuation
        // loop could detect them as still pending.
        if (continuesPlan && !abortSignal?.aborted) {
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

      // Tokens were spent even on abort, so always persist the turn stats;
      // only the live update needs an open stream
      if (turnAcc.steps > 0) {
        try {
          const metadata = await this.persistTurnMetadata(
            conversationId,
            llmConfig,
            turnAcc,
          );
          if (metadata && !controllerClosed && !abortSignal?.aborted) {
            controller.enqueue({
              type: 'data-conversation-stats',
              data: { metadata },
              transient: true,
            } as unknown as UIMessageChunk);
          }
        } catch (err) {
          this.logger.error('Failed to persist turn stats', err);
        }
      }

      if (!controllerClosed && !abortSignal?.aborted) {
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      }
    };

    return new ReadableStream<UIMessageChunk>({
      start: async (controller) => {
        try {
          await runLoop(controller);
        } finally {
          // Final states, turn stats and cleanup are saved: the run is over
          options.onSettled?.();
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

    // Step 1.5: Apply a changed approval mode and drop any approved plan
    if (dto.approvalMode && dto.approvalMode !== conversation.approvalMode) {
      await this.approvals.resetConversation(conversation.id);
      conversation.approvalMode = dto.approvalMode;
      await this.conversationRepository.update(conversation.id, {
        approvalMode: dto.approvalMode,
      });
    }

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
      userId,
    );

    // Show the model and its context window right away (before the turn ends)
    updateConversationMetadata(
      this.conversationRepository.manager,
      conversation.id,
      this.modelMetadata(llmConfig),
    ).catch((err) =>
      this.logger.error('Failed to save conversation model metadata', err),
    );

    // Step 5: Map history to AI SDK message format
    const modelMessages = this.mapHistoryToModelMessages(historyMessages);

    // Step 6: Validate that the model supports tool calling
    await this.validateToolSupport(llmConfig);

    // Step 7: Create a LanguageModel instance from the config
    const model = await this.createLanguageModel(llmConfig, workspaceId);

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

    // Step 8: Determine agent mode (a new conversation got the user's default)
    const agentMode = dto.agentMode || conversation.agentMode || AgentMode.ASK;

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
      ReturnType<AgentsSkillsService['createLoadSkillTool']> | undefined;
    if (skillsPrompt) {
      contextParts.push(skillsPrompt);
      skillsContext = skillsPrompt;
      loadSkillTool = this.agentsSkillsService.createLoadSkillTool(workspaceId);
    }

    // Step 10.6: Background subagents the agent can delegate to
    const subagentsPrompt = await this.getSubagentsPrompt(
      agentMode,
      workspaceId,
      userId,
    );
    if (subagentsPrompt) {
      contextParts.push(subagentsPrompt);
      // rebuildContext only re-adds skillsContext between iterations
      skillsContext = [skillsContext, subagentsPrompt]
        .filter(Boolean)
        .join('\n\n');
    }

    // Step 11: Create a shared event emitter for broadcasting todo updates to the stream
    const todosEmitter = new EventEmitter();

    const planning = planningState(
      conversation.approvalMode,
      await this.loadTodoItems(conversation.id),
    );

    // Shared by every tool of this run: approving a plan switches its mode
    const approval: ApprovalSettings = {
      userId,
      mode: conversation.approvalMode,
      // In PLAN mode nothing runs before the user has seen and approved a plan
      planFirst: true,
    };

    const externalMcpTools = this.agentTool.wrapExternalToolsWithApproval(
      (await this.agentsMcpService.getTools(workspaceId)) as ToolSet,
      workspaceId,
      conversation.id,
      approval,
      todosEmitter,
    );

    // Set by the continuation loop: ties results read by a tool to its iteration
    const subagentHooks: { onResultRead?: (id: string) => void } = {};

    // Get tools for the current agent mode
    const tools = {
      // Built-in tools below take precedence over colliding external names.
      ...externalMcpTools,
      ...(this.agentTool.getTools(
        workspaceId,
        agentMode,
        todosEmitter,
        conversation.id,
        approval,
      ) as ToolSet),
      ...this.getPlanTools(planning, conversation.id, todosEmitter, {
        workspaceId,
        approval,
      }),
      ...(loadSkillTool ? { load_skill: loadSkillTool } : {}),
      ...this.getSubagentTools(agentMode, {
        conversationId: conversation.id,
        workspaceId,
        userId,
        approval,
        todosEmitter,
        onResultRead: (id) => subagentHooks.onResultRead?.(id),
      }),
      // Add memory tools
      ...(this.agentTool.getMemoryTools(
        workspaceId,
        userId,
        conversation.id,
      ) as ToolSet),
    };

    // Step 12: Build the combined stream with auto-continuation
    const enabledTools = withoutDisabledTools(
      tools,
      await this.agentsConfig.find(workspaceId, userId),
    );
    const toolSetArg: ToolSet | undefined =
      Object.keys(enabledTools).length > 0 ? enabledTools : undefined;

    // Step 12.5: Hand back subagent results no earlier run consumed. They go
    // into the new question itself: a second consecutive user message is
    // rejected or merged badly by some providers.
    const undelivered = await this.subagents.takeUndelivered(conversation.id);
    const lastMessage = modelMessages[modelMessages.length - 1];
    let deliveredResults: string | undefined;
    if (undelivered.length > 0 && lastMessage?.role === 'user') {
      deliveredResults = this.subagents.formatResultsMessage(undelivered);
      lastMessage.content = `${deliveredResults}\n\n---\n\n${lastMessage.content}`;
    } else if (undelivered.length > 0) {
      await this.subagents.releaseDelivery(undelivered.map((r) => r.id));
      undelivered.length = 0;
    }

    let onSettled: (() => void) | undefined;
    const settled = new Promise<void>((resolve) => {
      onSettled = resolve;
    });
    const stream = this.createContinuationStream({
      onSettled,
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
      approvalMode: conversation.approvalMode,
      planning,
      workspaceId,
      userId,
      skillsContext,
      deliveredSubagentIds: undelivered.map((r) => r.id),
      deliveredSubagentResults: deliveredResults,
      subagentHooks,
    });

    // Step 13: Return stream + conversationId to the controller
    return {
      stream,
      conversationId: conversation.id,
      settled,
    };
  }
}
