import { decryptWithDEK } from '@/common/utils/workspace-encryption.util';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LanguageModel } from 'ai';
import { In, Repository } from 'typeorm';
import {
  AgentConfigResponseDto,
  AgentSearchProviderInputDto,
  UpsertAgentConfigDto,
} from './dto/agent-config.dto';
import {
  AgentConfig,
  AgentModelRef,
  AgentModelsConfig,
  AgentSearchProviderConfig,
} from './entities/agent-config.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { LLMProvider, SearchProvider } from './enums/agent.enums';
import { getLLMProviderConfig } from './llm-provider-supported';
import {
  isUnauthorizedError,
  OrcaRouterCredentialService,
} from './orcarouter/orcarouter-credential.service';
import { currentToolName } from './tools/helpers';

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

/** The tool set without the tools the user turned off. */
export function withoutDisabledTools<T extends Record<string, unknown>>(
  tools: T,
  config: AgentConfig | null,
): T {
  const disabled = new Set((config?.disabledTools ?? []).map(currentToolName));
  if (disabled.size === 0) return tools;
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => !disabled.has(name)),
  ) as T;
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
    private readonly workspaceEncryption: WorkspaceEncryptionService,
    private readonly orcaRouterCredentials: OrcaRouterCredentialService,
  ) {}

  /**
   * Terminal authentication failure from the provider: mark the exact
   * credential generation as needing reauthentication. There is no refresh
   * grant for an OrcaRouter key and nothing is deleted here — the user must
   * reconnect (or paste a new key) before the connection is usable again.
   */
  async reportProviderAuthError(
    config: AgentLLMConfig,
    error: unknown,
  ): Promise<void> {
    if (config.provider !== LLMProvider.ORCAROUTER) return;
    if (!isUnauthorizedError(error) || !config.apiKey) return;
    const apiKey = await this.workspaceEncryption.decrypt(
      config.workspaceId,
      config.apiKey,
    );
    await this.orcaRouterCredentials.reportUnauthorized(config.id, apiKey);
  }

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

  /** Builds the AI SDK model of a connection (decrypting its API key). */
  async createLanguageModel(
    config: AgentLLMConfig,
    workspaceId: string,
  ): Promise<LanguageModel> {
    let apiKey = '';
    if (config.apiKey) {
      apiKey = await this.workspaceEncryption.decrypt(
        workspaceId,
        config.apiKey,
      );
    }
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

  /**
   * The model background subagents run with: the first `modelsConfig.subagents`
   * ref, else the conversation's own connection, else the user's default.
   */
  async resolveSubagentLLMConfig(
    workspaceId: string,
    userId: string,
    fallbackLlmConfigId: string,
    /** The subagent's own model, tried first */
    override?: { llmConfigId: string; model: string },
  ): Promise<ResolvedLLMConfig | null> {
    const agentConfig = await this.find(workspaceId, userId);
    const ref = override ?? agentConfig?.modelsConfig.subagents?.[0];
    if (ref) {
      const llmConfig = await this.llmConfigRepository.findOne({
        where: { id: ref.llmConfigId, workspaceId, userId },
      });
      if (llmConfig) return withAgentConfig(llmConfig, agentConfig, ref.model);
    }
    const fallback = await this.llmConfigRepository.findOne({
      where: { id: fallbackLlmConfigId, workspaceId, userId },
    });
    if (fallback) return withAgentConfig(fallback, agentConfig);
    return this.getDefaultLLMConfig(workspaceId, userId, agentConfig);
  }

  async get(
    workspaceId: string,
    userId: string,
  ): Promise<AgentConfigResponseDto> {
    const config = await this.find(workspaceId, userId);
    return this.toResponse(config, workspaceId);
  }

  async upsert(
    workspaceId: string,
    userId: string,
    dto: UpsertAgentConfigDto,
  ): Promise<AgentConfigResponseDto> {
    const config = await this.findOrCreate(workspaceId, userId);

    if (dto.modelsConfig !== undefined) {
      const models = dto.modelsConfig ?? {};
      await this.assertOwnLLMConfigs(workspaceId, userId, models);
      config.modelsConfig = models;
      // Chat picks its model from the connection, so keep it on the default
      if (models.default) {
        await this.llmConfigRepository.update(
          { id: models.default.llmConfigId, workspaceId, userId },
          { model: models.default.model },
        );
      }
    }
    if (dto.searchProviders !== undefined) {
      config.searchProviders = await this.mergeSearchProviders(
        workspaceId,
        config.searchProviders,
        dto.searchProviders ?? [],
      );
    }
    if (dto.instruction !== undefined) {
      config.instruction = dto.instruction?.trim() || null;
    }
    if (dto.maxSteps !== undefined) config.maxSteps = dto.maxSteps;
    if (dto.defaultAgentMode !== undefined) {
      config.defaultAgentMode = dto.defaultAgentMode;
    }
    if (dto.defaultApprovalMode !== undefined) {
      config.defaultApprovalMode = dto.defaultApprovalMode;
    }
    if (dto.disabledTools !== undefined) {
      config.disabledTools = [
        ...new Set(dto.disabledTools.map(currentToolName)),
      ];
    }
    if (dto.responseLanguage !== undefined) {
      config.responseLanguage = dto.responseLanguage || null;
    }

    const saved = await this.configRepository.save(config);
    return this.toResponse(saved, workspaceId);
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

  /** Search providers with plain API keys, default first. */
  async getSearchProviders(
    workspaceId: string,
    userId: string,
  ): Promise<{ provider: SearchProvider; apiKey: string }[]> {
    const config = await this.find(workspaceId, userId);
    if (!config?.searchProviders.length) return [];
    const dek = await this.workspaceEncryption.getDEK(workspaceId);
    return [...config.searchProviders]
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      .map((p) => ({
        provider: p.provider,
        apiKey: decryptWithDEK(p.apiKey, dek),
      }));
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

  private async assertOwnLLMConfigs(
    workspaceId: string,
    userId: string,
    models: AgentModelsConfig,
  ): Promise<void> {
    const ids = [...new Set(modelRefs(models).map((ref) => ref.llmConfigId))];
    if (ids.length === 0) return;
    const found = await this.llmConfigRepository.count({
      where: { id: In(ids), workspaceId, userId },
    });
    if (found !== ids.length) {
      throw new BadRequestException('LLM config not found');
    }
  }

  /**
   * Replaces the provider list. An entry without apiKey keeps the saved key;
   * exactly one entry ends up as the default.
   */
  private async mergeSearchProviders(
    workspaceId: string,
    saved: AgentSearchProviderConfig[],
    input: AgentSearchProviderInputDto[],
  ): Promise<AgentSearchProviderConfig[]> {
    const providers = input.map((p) => p.provider);
    if (new Set(providers).size !== providers.length) {
      throw new BadRequestException('Each search provider can be added once');
    }
    if (input.filter((p) => p.isDefault).length > 1) {
      throw new BadRequestException('Only one search provider can be default');
    }
    const hasDefault = input.some((p) => p.isDefault);

    return Promise.all(
      input.map(async (p, index) => {
        let apiKey = saved.find((s) => s.provider === p.provider)?.apiKey;
        if (p.apiKey) {
          apiKey = await this.workspaceEncryption.encrypt(
            workspaceId,
            p.apiKey,
          );
        }
        if (!apiKey) {
          throw new BadRequestException(`API key required for ${p.provider}`);
        }
        return {
          provider: p.provider,
          apiKey,
          isDefault: hasDefault ? !!p.isDefault : index === 0,
        };
      }),
    );
  }

  private async toResponse(
    config: AgentConfig | null,
    workspaceId: string,
  ): Promise<AgentConfigResponseDto> {
    const providers = config?.searchProviders ?? [];
    const dek = providers.length
      ? await this.workspaceEncryption.getDEK(workspaceId)
      : null;
    return {
      modelsConfig: config?.modelsConfig ?? {},
      searchProviders: providers.map((p) => ({
        provider: p.provider,
        apiKeyMasked: maskApiKey(decryptWithDEK(p.apiKey, dek)),
        isDefault: p.isDefault,
      })),
      instruction: config?.instruction ?? null,
      maxSteps: config?.maxSteps ?? null,
      defaultAgentMode: config?.defaultAgentMode ?? null,
      defaultApprovalMode: config?.defaultApprovalMode ?? null,
      disabledTools: (config?.disabledTools ?? []).map(currentToolName),
      responseLanguage: config?.responseLanguage ?? null,
    };
  }
}
