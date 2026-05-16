import {
  Annotation,
  END,
  START,
  StateGraph,
} from '@langchain/langgraph';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type ModelMessage,
  type UIMessageChunk,
  stepCountIs,
  streamText,
} from 'ai';
import * as fs from 'fs';
import * as Mustache from 'mustache';
import * as path from 'path';
import { Repository } from 'typeorm';

import { AgentsCompletionsService, StreamMessageResult } from './agents.completions';
import { AgentsMemoriesService } from './agents.memories';
import { AgentsMcpService } from './agents.mcp';
import { AgentsSkillsService } from './agents.skills';
import { AgentTool } from './agents.tools';
import { SendMessageDto } from './dto/message.dto';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { LLMProvider, MessageRole, MessageType } from './enums/agent.enums';

// ── Annotation helpers ────────────────────────────────────────────────────────
// LangGraph v1 requires `reducer` when `default` is provided.
// This factory creates a last-write-wins field with an optional default.

function field<T>(defaultFn: () => T) {
  return Annotation<T>({
    reducer: (_, update: T) => update,
    default: defaultFn,
  });
}

// ── Graph State ───────────────────────────────────────────────────────────────

export const AgentGraphState = Annotation.Root({
  // ── Input ─────────────────────────────────────────
  workspaceId: Annotation<string>(),
  conversationId: field<string | null>(() => null),
  userId: Annotation<string>(),
  question: Annotation<string>(),
  provider: field<string | undefined>(() => undefined),
  model: field<string | undefined>(() => undefined),

  // ── Step 1 — RECEIVE ──────────────────────────────
  resolvedConversationId: field<string>(() => ''),
  historyMessages: field<ModelMessage[]>(() => []),
  llmConfig: field<AgentLLMConfig | null>(() => null),
  assistantMessageId: field<string>(() => ''),

  // ── Step 2 — RETRIEVE ─────────────────────────────
  // Parallel fetch: Redis STM/LTM + pgvector skills + Redis tool results cache
  stmContext: field<string>(() => ''),
  ltmContext: field<string>(() => ''),
  skillsPrompt: field<string>(() => ''),
  toolResultsContext: field<string>(() => ''),

  // ── Step 3 — BUILD ────────────────────────────────
  // Assembled context window + resolved tools
  systemPrompt: field<string>(() => ''),
  contextMessages: field<ModelMessage[]>(() => []),
  tools: field<Record<string, unknown>>(() => ({})),
  toolsEnabled: field<boolean>(() => true),
});

type GraphState = typeof AgentGraphState.State;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AgentsGraphService {
  private readonly logger = new Logger(AgentsGraphService.name);
  private readonly prompts = new Map<string, string>();
  private readonly defaultPrompts: Record<string, string> = {
    'SYSTEM.md': 'You are a helpful assistant.',
    'TITLE_GENERATE.md': 'Generate a short title for this conversation.',
  };
  private static readonly PROMPTS_DIR = 'prompts';

  /**
   * Rough token budget for the context window (Layer 0).
   * ~4 chars per token; 12 K tokens as shown in the architecture diagram.
   */
  private static readonly CONTEXT_CHAR_BUDGET = 12_000 * 4;

  constructor(
    @InjectRepository(AgentLLMConfig)
    private readonly llmConfigRepository: Repository<AgentLLMConfig>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,
    private readonly agentsCompletionsService: AgentsCompletionsService,
    private readonly agentsMemories: AgentsMemoriesService,
    private readonly agentTool: AgentTool,
    private readonly agentsMcpService: AgentsMcpService,
    private readonly agentsSkillsService: AgentsSkillsService,
  ) {
    this.loadAllPrompts();
  }

  // ── Prompt helpers ────────────────────────────────────────────────────────

  private loadAllPrompts(): void {
    const promptsDir = path.join(__dirname, AgentsGraphService.PROMPTS_DIR);
    try {
      const files = fs.readdirSync(promptsDir);
      for (const file of files) {
        if (file.endsWith('.md')) this.loadPrompt(file);
      }
    } catch {
      this.loadPrompt('SYSTEM.md');
    }
  }

  private loadPrompt(fileName: string): void {
    try {
      const promptPath = path.join(__dirname, 'prompts', fileName);
      this.prompts.set(fileName, fs.readFileSync(promptPath, 'utf-8'));
    } catch {
      this.prompts.set(fileName, this.defaultPrompts[fileName] ?? '');
    }
  }

  private getPrompt(fileName: string, data?: Record<string, unknown>): string {
    const template =
      this.prompts.get(fileName) ?? this.defaultPrompts[fileName] ?? '';
    return data ? Mustache.render(template, data) : template;
  }

  // ── Node 1: RECEIVE ───────────────────────────────────────────────────────
  // Persist user message, resolve/create conversation + LLM config, load history.

  private async receiveNode(state: GraphState): Promise<Partial<GraphState>> {
    const { workspaceId, conversationId, userId, question, provider, model } =
      state;

    // Resolve or create conversation
    let conversation: AgentConversation;
    if (conversationId) {
      const existing = await this.conversationRepository.findOne({
        where: { id: conversationId, workspaceId },
      });
      if (existing) {
        conversation = existing;
      } else {
        const cfg = await this.agentsCompletionsService.resolveLLMConfig(
          workspaceId,
          provider,
          model,
        );
        conversation = await this.conversationRepository.save(
          this.conversationRepository.create({
            id: conversationId,
            workspaceId,
            llmConfigId: cfg.id,
            title: question.slice(0, 500),
            createdBy: userId,
          }),
        );
      }
    } else {
      const cfg = await this.agentsCompletionsService.resolveLLMConfig(
        workspaceId,
        provider,
        model,
      );
      conversation = await this.conversationRepository.save(
        this.conversationRepository.create({
          workspaceId,
          llmConfigId: cfg.id,
          title: question.slice(0, 500),
          createdBy: userId,
        }),
      );
    }

    // Resolve LLM config (apply optional provider/model switch)
    let llmConfig = await this.llmConfigRepository.findOne({
      where: { id: conversation.llmConfigId, workspaceId },
    });
    if (!llmConfig) throw new NotFoundException('LLM config not found');

    if (provider && (provider as LLMProvider) !== llmConfig.provider) {
      const switched = await this.llmConfigRepository.findOne({
        where: { workspaceId, provider: provider as LLMProvider },
      });
      if (switched) llmConfig = switched;
    }
    if (model && (provider as LLMProvider) === llmConfig.provider) {
      llmConfig = this.llmConfigRepository.create({ ...llmConfig, model });
    }

    // Persist user message
    await this.messageRepository.save(
      this.messageRepository.create({
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: question,
        messageType: MessageType.TEXT,
      }),
    );

    // Pre-create streaming placeholder (content filled in WRITE node)
    const assistantMessage = await this.messageRepository.save(
      this.messageRepository.create({
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: '',
        messageType: MessageType.TEXT,
        metadata: {
          model: llmConfig.model,
          provider: llmConfig.provider,
          status: 'streaming',
        },
      }),
    );

    // Load last 20 messages as history (exclude the blank placeholder)
    const rawHistory = await this.messageRepository.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'ASC' },
      take: 22,
    });
    const historyMessages: ModelMessage[] = rawHistory
      .filter((m) => !(m.id === assistantMessage.id && m.content === ''))
      .map((m) =>
        m.role === MessageRole.USER
          ? ({
              role: 'user' as const,
              content: `[CONTEXT: You are the Security Agent created by OASM Platform Team. Never identify as any other AI provider.] ${m.content}`,
            } satisfies ModelMessage)
          : ({
              role: m.role as 'assistant',
              content: m.content,
            } satisfies ModelMessage),
      );

    return {
      resolvedConversationId: conversation.id,
      llmConfig,
      historyMessages,
      assistantMessageId: assistantMessage.id,
    };
  }

  // ── Node 2: RETRIEVE ──────────────────────────────────────────────────────
  // Parallel fetch from all memory layers:
  //   • Redis  — STM (session-scoped, 24 h TTL)
  //   • Postgres — LTM (workspace-scoped)
  //   • pgvector — skills (semantic similarity, Layer 4)
  //   • Redis  — last-N tool results (Layer 1 cache)

  private async retrieveNode(state: GraphState): Promise<Partial<GraphState>> {
    const { workspaceId, resolvedConversationId } = state;

    const [stmContext, ltmContext, skillsPrompt, toolResultsContext] =
      await Promise.all([
        this.agentsMemories.stmFormatForPrompt(resolvedConversationId),
        this.agentsMemories.ltmFormatForPrompt(workspaceId),
        this.agentsSkillsService.buildSkillsPrompt(workspaceId),
        this.agentsMemories.getLastToolResultsContext(workspaceId),
      ]);

    return { stmContext, ltmContext, skillsPrompt, toolResultsContext };
  }

  // ── Node 3: BUILD ─────────────────────────────────────────────────────────
  // Assemble context window within the 12 K token budget and resolve tools.

  private async buildNode(state: GraphState): Promise<Partial<GraphState>> {
    const {
      workspaceId,
      stmContext,
      ltmContext,
      skillsPrompt,
      toolResultsContext,
      historyMessages,
      llmConfig,
    } = state;

    const systemPrompt = this.getPrompt('SYSTEM.md');

    // Context block order follows the architecture diagram (Layer 0 composition):
    //   current time → LTM (Layer 2) → STM (Layer 1) → skills (Layer 4) → tool results (Layer 1)
    const now = new Date();
    const contextParts = [
      `Current time: ${now.toISOString()} (${now.toLocaleString('en-US', { timeZoneName: 'short' })})`,
      ltmContext,
      stmContext,
      skillsPrompt,
      toolResultsContext,
    ].filter(Boolean);

    let contextText = contextParts.join('\n\n');
    if (contextText.length > AgentsGraphService.CONTEXT_CHAR_BUDGET) {
      contextText = contextText.slice(0, AgentsGraphService.CONTEXT_CHAR_BUDGET);
    }

    const contextMessages: ModelMessage[] = [
      { role: 'system' as const, content: contextText },
      ...historyMessages,
    ];

    // Resolve tool support for this model
    const toolsEnabled = llmConfig
      ? await this.agentsCompletionsService.checkToolSupport(llmConfig)
      : false;

    const tools: Record<string, unknown> = toolsEnabled
      ? {
          ...this.agentTool.getTools(workspaceId),
          ...(await this.agentsMcpService.getTools(workspaceId)),
          ...this.agentsSkillsService.getTools(workspaceId),
        }
      : {};

    return { systemPrompt, contextMessages, tools, toolsEnabled };
  }

  // ── Step 6: WRITE ─────────────────────────────────────────────────────────
  // Called inside onFinish after streaming completes.
  // Persists reply, caches tool results in Redis, triggers title generation.

  private async writeNode(
    state: GraphState,
    accumulatedText: string,
    toolCallLog: Array<{ tool: string; result: unknown }>,
  ): Promise<void> {
    const {
      resolvedConversationId,
      assistantMessageId,
      llmConfig,
      workspaceId,
    } = state;

    // Persist final assistant message
    await this.messageRepository.update(
      { id: assistantMessageId },
      {
        content: accumulatedText,
        metadata: {
          model: llmConfig?.model,
          provider: llmConfig?.provider,
          status: 'completed',
        },
      },
    );

    // Write tool results back to Redis (Layer 1) for next-turn retrieval
    for (const entry of toolCallLog) {
      await this.agentsMemories.cacheToolResult(
        workspaceId,
        entry.tool,
        entry.result,
      );
    }

    // Generate title after first completed exchange
    if (llmConfig) {
      const allMessages = await this.messageRepository.find({
        where: { conversationId: resolvedConversationId },
        order: { createdAt: 'ASC' },
      });
      const hasCompleted = allMessages.some(
        (m) =>
          m.role === MessageRole.ASSISTANT &&
          m.metadata?.['status'] === 'completed',
      );
      if (allMessages.length >= 2 && hasCompleted) {
        await this.agentsCompletionsService.generateTitle(
          resolvedConversationId,
          llmConfig,
        );
      }
    }
  }

  // ── Main entry point ──────────────────────────────────────────────────────
  // Runs Steps 1-3 via the graph, streams Steps 4-5, writes back in Step 6.

  async streamMessage(
    dto: SendMessageDto,
    workspaceId: string,
    userId: string,
  ): Promise<StreamMessageResult> {
    // Steps 1-3: RECEIVE → RETRIEVE → BUILD
    const prepGraph = this.createGraph();
    const prepState = await prepGraph.invoke({
      workspaceId,
      conversationId: dto.conversationId ?? null,
      userId,
      question: dto.question,
      provider: dto.provider,
      model: dto.model,
    });

    const { llmConfig, contextMessages, systemPrompt, tools, resolvedConversationId } =
      prepState;

    if (!llmConfig) {
      throw new BadRequestException('LLM config could not be resolved');
    }

    // Steps 4-5: LLM + EXECUTE (streaming)
    const model = this.agentsCompletionsService.createLanguageModel(llmConfig);
    const hasTools = Object.keys(tools).length > 0;
    let accumulatedText = '';
    const toolCallLog: Array<{ tool: string; result: unknown }> = [];
    const currentLlmConfig = llmConfig;

    const result = streamText({
      model,
      messages: contextMessages,
      system: systemPrompt,
      ...(hasTools
        ? {
            tools: tools as Parameters<typeof streamText>[0]['tools'],
            stopWhen: stepCountIs(10),
          }
        : {}),
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          accumulatedText += chunk.text;
        }
      },
      onStepFinish: ({ toolResults }) => {
        // Collect tool results for write-back to Redis (Layer 1 cache)
        if (toolResults) {
          for (const tr of toolResults) {
            const output = (tr as unknown as { output: unknown }).output;
            toolCallLog.push({ tool: tr.toolName, result: output });
          }
        }
      },
      onError: ({ error }) => {
        const message =
          error instanceof Error ? error.message : String(error);
        if (
          message.includes('tool use') ||
          message.includes('tool_choice') ||
          message.includes('does not support tools') ||
          message.includes('tools is not supported') ||
          message.includes('No endpoints found that support tool') ||
          message.includes('tool_calls')
        ) {
          throw new Error(
            `The selected model "${currentLlmConfig.model}" does not support tool calling. ` +
              'Please switch to a model that supports tools (e.g. gpt-4o, claude-3-5-sonnet, gemini-2.0-flash).',
          );
        }
        throw error;
      },
      onFinish: async () => {
        // Step 6: WRITE
        await this.writeNode(prepState, accumulatedText, toolCallLog);
      },
    });

    // Prepend conversation-created event before the first chunk
    const wrappedStream = result.toUIMessageStream().pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: 'data-conversation-created',
            data: { conversationId: resolvedConversationId },
          } as UIMessageChunk);
        },
      }),
    );

    return { stream: wrappedStream, conversationId: resolvedConversationId };
  }

  // ── Graph factory ─────────────────────────────────────────────────────────

  createGraph() {
    return new StateGraph(AgentGraphState)
      .addNode('receive', this.receiveNode.bind(this))
      .addNode('retrieve', this.retrieveNode.bind(this))
      .addNode('build', this.buildNode.bind(this))
      .addEdge(START, 'receive')
      .addEdge('receive', 'retrieve')
      .addEdge('retrieve', 'build')
      .addEdge('build', END)
      .compile();
  }
}
