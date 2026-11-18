import { InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LanguageModel } from 'ai';
import { Repository } from 'typeorm';
import {
  AgentsConfigService,
  type ResolvedLLMConfig,
  withAgentConfig,
} from './agents.config';
import type { SendMessageDto } from './dto/message.dto';
import type { AgentConfig } from './entities/agent-config.entity';
import type { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { LLMProvider } from './enums/agent.enums';

/**
 * Which LLM connection and model a chat turn runs on: the user's default (or
 * the provider/model the request names), the conversation's config with the
 * request's overrides, the language model built from it, and the OpenRouter
 * tool-calling check (model list cached in memory for 10 minutes).
 */
@Injectable()
export class LlmConfigResolver {
  private readonly logger = new Logger(LlmConfigResolver.name);
  private readonly toolCapableModelsCache = new Map<string, Set<string>>();
  private toolCapableCacheExpiry = 0;
  private static readonly TOOL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    @InjectRepository(AgentLLMConfig)
    private readonly llmConfigRepository: Repository<AgentLLMConfig>,
    private readonly agentsConfig: AgentsConfigService,
  ) {}

  async resolveLLMConfig(
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
      throw new InvalidInputError(
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
  async validateToolSupport(config: AgentLLMConfig): Promise<void> {
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
            now + LlmConfigResolver.TOOL_CACHE_TTL_MS;
        }
      } catch (err) {
        this.logger.warn('Failed to fetch OpenRouter model capabilities', err);
        return; // Assume capable if check fails
      }
    }

    if (toolModels && !toolModels.has(config.model)) {
      throw new InvalidInputError(
        `The selected model "${config.model}" does not support tool calling. ` +
          'Please switch to a model that supports tools (e.g. gpt-4o, claude-3-5-sonnet, gemini-2.0-flash).',
      );
    }
  }

  createLanguageModel(
    config: AgentLLMConfig,
    workspaceId: string,
  ): Promise<LanguageModel> {
    return this.agentsConfig.createLanguageModel(config, workspaceId);
  }

  /**
   * Resolves the final LLM config after applying DTO overrides.
   * - Starts from the conversation's default config
   * - If user switches provider → find config for that provider
   * - If user changes model (same provider) → override model in memory (no DB write)
   */
  async resolveLLMConfigWithOverrides(
    conversation: AgentConversation,
    dto: SendMessageDto,
    workspaceId: string,
    userId: string,
    loadedAgentConfig?: AgentConfig | null,
  ): Promise<ResolvedLLMConfig> {
    // Get the base config from the conversation
    let llmConfig = await this.llmConfigRepository.findOne({
      where: { id: conversation.llmConfigId, workspaceId, userId },
    });

    if (!llmConfig) {
      throw new NotFoundError('LLM config not found');
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
    const agentConfig =
      loadedAgentConfig !== undefined
        ? loadedAgentConfig
        : await this.agentsConfig.find(workspaceId, userId);
    const defaultRef = agentConfig?.modelsConfig.default;
    const model =
      dto.model && dto.provider === llmConfig.provider
        ? dto.model
        : defaultRef?.llmConfigId === llmConfig.id
          ? defaultRef.model
          : llmConfig.model;

    return withAgentConfig(llmConfig, agentConfig, model);
  }
}
