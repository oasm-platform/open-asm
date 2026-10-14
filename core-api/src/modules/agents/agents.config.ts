import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentConfig,
  AgentModelRef,
  AgentModelsConfig,
} from './entities/agent-config.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) return '****';
  return '*'.repeat(apiKey.length - 4) + apiKey.slice(-4);
}

/** Every model ref in a models config, so none points at a foreign connection. */
function modelRefs(models: AgentModelsConfig): AgentModelRef[] {
  return [models.default, models.small, ...(models.subagents ?? [])].filter(
    (ref): ref is AgentModelRef => !!ref,
  );
}

/** System prompt part with the user's own instructions, or '' when none. */
export function formatUserInstructions(config: AgentConfig | null): string {
  const parts = [
    config?.instruction?.trim()
      ? `## User instructions\n${config.instruction.trim()}`
      : '',
    config?.responseLanguage
      ? `Always answer in this language: ${config.responseLanguage}`
      : '',
  ].filter(Boolean);
  return parts.join('\n\n');
}

/** An LLM connection with the model and limits the agent runs it with. */
export type ResolvedLLMConfig = AgentLLMConfig & {
  contextWindow?: number;
  maxOutputTokens?: number;
  maxSteps?: number;
};

/**
 * Runs `model` (default: the connection's own) on a connection, with the
 * limits of the matching model ref and the agent's step budget.
 */
export function withAgentConfig(
  llmConfig: AgentLLMConfig,
  agentConfig: AgentConfig | null,
  model = llmConfig.model,
): ResolvedLLMConfig {
  const ref = modelRefs(agentConfig?.modelsConfig ?? {}).find(
    (r) => r.llmConfigId === llmConfig.id && r.model === model,
  );
  return {
    ...llmConfig,
    model,
    contextWindow: ref?.contextWindow,
    maxOutputTokens: ref?.maxOutputTokens,
    maxSteps: agentConfig?.maxSteps ?? undefined,
  };
}

/**
 * The user's default model: `modelsConfig.default`, or their oldest
 * connection when no default is set (or it was deleted).
 */
export async function findDefaultLLMConfig(
  repos: {
    llmConfigs: Repository<AgentLLMConfig>;
    agentConfigs: Repository<AgentConfig>;
  },
  workspaceId: string,
  userId: string,
  agentConfig?: AgentConfig | null,
): Promise<ResolvedLLMConfig | null> {
  const config =
    agentConfig !== undefined
      ? agentConfig
      : await repos.agentConfigs.findOne({ where: { workspaceId, userId } });
  const ref = config?.modelsConfig.default;
  const llmConfig = ref
    ? await repos.llmConfigs.findOne({
        where: { id: ref.llmConfigId, workspaceId, userId },
      })
    : null;
  if (llmConfig) return withAgentConfig(llmConfig, config, ref?.model);

  const oldest = await repos.llmConfigs.findOne({
    where: { workspaceId, userId },
    order: { createdAt: 'ASC' },
  });
  return oldest ? withAgentConfig(oldest, config) : null;
}

@Injectable()
export class AgentsConfigService {
  constructor(
    @InjectRepository(AgentConfig)
    private readonly configRepository: Repository<AgentConfig>,
    @InjectRepository(AgentLLMConfig)
    private readonly llmConfigRepository: Repository<AgentLLMConfig>,
  ) {}

  find(workspaceId: string, userId: string): Promise<AgentConfig | null> {
    return this.configRepository.findOne({ where: { workspaceId, userId } });
  }

  getDefaultLLMConfig(
    workspaceId: string,
    userId: string,
    agentConfig?: AgentConfig | null,
  ): Promise<ResolvedLLMConfig | null> {
    return findDefaultLLMConfig(
      {
        llmConfigs: this.llmConfigRepository,
        agentConfigs: this.configRepository,
      },
      workspaceId,
      userId,
      agentConfig,
    );
  }

  /** Makes this connection the default model, keeping its limits if unchanged. */
  async setDefaultModel(
    workspaceId: string,
    userId: string,
    llmConfigId: string,
    model: string,
  ): Promise<void> {
    const config = await this.findOrCreate(workspaceId, userId);
    const current = config.modelsConfig.default;
    config.modelsConfig = {
      ...config.modelsConfig,
      default:
        current?.llmConfigId === llmConfigId
          ? { ...current, model }
          : { llmConfigId, model },
    };
    await this.configRepository.save(config);
  }

  /** Drops every model ref to a connection that is being deleted. */
  async removeLLMConfigRefs(
    workspaceId: string,
    userId: string,
    llmConfigId: string,
  ): Promise<void> {
    const config = await this.find(workspaceId, userId);
    if (!config) return;
    const keep = (ref?: AgentModelRef) =>
      ref && ref.llmConfigId !== llmConfigId ? ref : undefined;
    const { default: def, small, subagents } = config.modelsConfig;
    config.modelsConfig = {
      default: keep(def),
      small: keep(small),
      subagents: subagents?.filter((ref) => ref.llmConfigId !== llmConfigId),
    };
    await this.configRepository.save(config);
  }

  /**
   * The user's row, created first if missing. The insert skips on conflict,
   * so two first writes at once cannot hit the unique index.
   */
  private async findOrCreate(
    workspaceId: string,
    userId: string,
  ): Promise<AgentConfig> {
    const existing = await this.find(workspaceId, userId);
    if (existing) return existing;
    await this.configRepository
      .createQueryBuilder()
      .insert()
      .values({ workspaceId, userId })
      .orIgnore()
      .execute();
    return this.configRepository.findOneOrFail({
      where: { workspaceId, userId },
    });
  }
}
