import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ResolvedLLMConfig } from './agents.config';
import {
  FALLBACK_REASONING_EFFORTS,
  LLMProvider,
  ReasoningEffort,
} from './enums/agent.enums';
import {
  getReasoningProviderOptions,
  type ProviderReasoningOptions,
} from './llm-provider-supported';
import type { ContextWindowSource } from './shared/conversation-metadata';
import {
  type CatalogLookupResult,
  type ModelCost,
  type ModelReasoning,
  ModelsCatalogIndex,
  type TrimmedCatalog,
} from './shared/models-dev';

export interface ResolvedContextWindow {
  tokens: number;
  source: ContextWindowSource;
  /** True when the catalog match was a guess (bare model id). */
  estimated: boolean;
}

/**
 * Model limits and prices from the bundled models.dev snapshot
 * (`resources/models-dev/catalog.json`, refreshed by `task api:models:snapshot`).
 */
@Injectable()
export class AgentsModelsCatalogService implements OnModuleInit {
  static readonly DEFAULT_CONTEXT_WINDOW = 128_000;

  private readonly logger = new Logger(AgentsModelsCatalogService.name);
  private index: ModelsCatalogIndex | null = null;

  async onModuleInit(): Promise<void> {
    const file = path.resolve(
      process.cwd(),
      'resources',
      'models-dev',
      'catalog.json',
    );
    try {
      const catalog = JSON.parse(
        await fs.readFile(file, 'utf-8'),
      ) as TrimmedCatalog;
      if (catalog?.version !== 1 || !catalog.providers) {
        throw new Error('unsupported catalog format');
      }
      this.index = new ModelsCatalogIndex(catalog);
      this.logger.log(
        `Loaded models.dev catalog (${this.index.providerCount} providers)`,
      );
    } catch (error) {
      this.logger.warn(
        `models.dev catalog unavailable (${file}): ${
          error instanceof Error ? error.message : String(error)
        }; using default context window`,
      );
    }
  }

  lookup(
    provider: LLMProvider | string,
    model: string,
  ): CatalogLookupResult | null {
    return this.index?.lookup(provider, model) ?? null;
  }

  /** Context window: manual model setting > models.dev > 128k default. */
  resolveWindow(
    cfg: Pick<ResolvedLLMConfig, 'provider' | 'model' | 'contextWindow'>,
  ): ResolvedContextWindow {
    if (cfg.contextWindow && cfg.contextWindow > 0) {
      return { tokens: cfg.contextWindow, source: 'manual', estimated: false };
    }
    // OrcaRouter's own routes are not on models.dev: a bare-id guess would
    // borrow another host's window (`orcarouter/auto` -> openrouter/auto, 2M)
    const ownRoute =
      cfg.provider === LLMProvider.ORCAROUTER &&
      /^(orcarouter|orca)\//i.test(cfg.model);
    const hit = ownRoute ? null : this.lookup(cfg.provider, cfg.model);
    if (hit && hit.entry.limit.context > 0) {
      return {
        tokens: hit.entry.limit.context,
        source: 'catalog',
        estimated: hit.estimated,
      };
    }
    return {
      tokens: AgentsModelsCatalogService.DEFAULT_CONTEXT_WINDOW,
      source: 'default',
      estimated: true,
    };
  }

  /** Reasoning knobs of a model; none for a guessed (bare id) match. */
  private reasoningOf(
    provider: LLMProvider | string,
    model: string,
  ): ModelReasoning | undefined {
    const hit = this.lookup(provider, model);
    return hit && !hit.estimated ? hit.entry.reasoning : undefined;
  }

  /** Effort levels to offer for a model: its own, else low to high. */
  reasoningEfforts(
    provider: LLMProvider | string,
    model: string,
  ): ReasoningEffort[] {
    return (
      this.reasoningOf(provider, model)?.efforts ?? FALLBACK_REASONING_EFFORTS
    );
  }

  /**
   * The picked effort, if the model offers it. A level picked for another
   * model gives undefined: the provider default.
   */
  effortFor(
    cfg: Pick<ResolvedLLMConfig, 'provider' | 'model' | 'reasoningEffort'>,
  ): ReasoningEffort | undefined {
    const effort = cfg.reasoningEffort;
    return effort &&
      this.reasoningEfforts(cfg.provider, cfg.model).includes(effort)
      ? effort
      : undefined;
  }

  /** Provider options that run the model at its picked effort. */
  reasoningOptions(
    cfg: Pick<ResolvedLLMConfig, 'provider' | 'model' | 'reasoningEffort'>,
  ): { providerOptions?: ProviderReasoningOptions } {
    const options = getReasoningProviderOptions(
      cfg.provider,
      this.effortFor(cfg),
      this.reasoningOf(cfg.provider, cfg.model),
    );
    return options ? { providerOptions: options } : {};
  }

  /** Price per 1M tokens; undefined for self-hosted (CUSTOM) or unknown models. */
  costOf(provider: LLMProvider | string, model: string): ModelCost | undefined {
    const custom: string = LLMProvider.CUSTOM;
    if (provider === custom) return undefined;
    // A guessed (bare id) match may be another host's price: treat as unknown
    const hit = this.lookup(provider, model);
    return hit && !hit.estimated ? hit.entry.cost : undefined;
  }
}
