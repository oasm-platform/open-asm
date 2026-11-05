import { Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { AgentsModelsCatalogService } from './agents.models-catalog';
import { LLMProvider, ReasoningEffort } from './enums/agent.enums';

describe('AgentsModelsCatalogService', () => {
  let service: AgentsModelsCatalogService;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    service = new AgentsModelsCatalogService();
    // Loads the bundled snapshot (resources/models-dev/catalog.json)
    await service.onModuleInit();
  });

  const cfg = (
    provider: LLMProvider,
    model: string,
    contextWindow?: number,
  ) => ({ provider, model, contextWindow });

  it('prefers the manual model setting', () => {
    expect(
      service.resolveWindow(cfg(LLMProvider.ANTHROPIC, 'claude-sonnet-4-5', 20_000)),
    ).toEqual({ tokens: 20_000, source: 'manual', estimated: false });
  });

  it('uses models.dev limits for known models', () => {
    expect(
      service.resolveWindow(cfg(LLMProvider.ANTHROPIC, 'claude-sonnet-4-5')),
    ).toMatchObject({ source: 'catalog', estimated: false });
    expect(
      service.resolveWindow(cfg(LLMProvider.OPENAI, 'gpt-5')).tokens,
    ).toBeGreaterThan(128_000);
  });

  it('falls back to 128k for unknown models', () => {
    expect(
      service.resolveWindow(cfg(LLMProvider.OPENAI, 'no-such-model-xyz')),
    ).toEqual({ tokens: 128_000, source: 'default', estimated: true });
  });

  it('does not guess the window of OrcaRouter routes from another host', () => {
    expect(
      service.resolveWindow(cfg(LLMProvider.ORCAROUTER, 'orcarouter/auto')),
    ).toEqual({ tokens: 128_000, source: 'default', estimated: true });
    // Vendor ids still resolve through models.dev
    expect(
      service.resolveWindow(cfg(LLMProvider.ORCAROUTER, 'openai/gpt-5')),
    ).toMatchObject({ source: 'catalog', estimated: false });
  });

  it('prices hosted models but not self-hosted ones', () => {
    expect(service.costOf(LLMProvider.ANTHROPIC, 'claude-sonnet-4-5')).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
    });
    expect(service.costOf(LLMProvider.CUSTOM, 'gpt-5')).toBeUndefined();
  });

  it("offers the model's own effort levels, else low to high", () => {
    expect(service.reasoningEfforts(LLMProvider.OPENAI, 'gpt-5')).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
    ]);
    expect(
      service.reasoningEfforts(LLMProvider.OPENAI, 'no-such-model-xyz'),
    ).toEqual(['low', 'medium', 'high']);
  });

  it('runs at the picked effort, or the provider default when the model lacks it', () => {
    const at = (model: string, reasoningEffort: ReasoningEffort) =>
      service.reasoningOptions({ provider: LLMProvider.OPENAI, model, reasoningEffort });
    expect(at('gpt-5', ReasoningEffort.MINIMAL)).toEqual({
      providerOptions: {
        openai: { reasoningEffort: 'minimal', reasoningSummary: 'auto' },
      },
    });
    // Not offered for gpt-5: back to the default (high)
    expect(at('gpt-5', ReasoningEffort.MAX)).toEqual({
      providerOptions: {
        openai: { reasoningEffort: 'high', reasoningSummary: 'auto' },
      },
    });
  });

  it('uses adaptive thinking for Anthropic models tuned only by effort', () => {
    expect(
      service.reasoningOptions({
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-opus-5-5',
        reasoningEffort: ReasoningEffort.XHIGH,
      }),
    ).toEqual({
      providerOptions: {
        anthropic: { thinking: { type: 'adaptive' }, effort: 'xhigh' },
      },
    });
    // Budget models get a budget for the level
    expect(
      service.reasoningOptions({
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-sonnet-4-5',
        reasoningEffort: ReasoningEffort.LOW,
      }),
    ).toEqual({
      providerOptions: {
        anthropic: { thinking: { type: 'enabled', budgetTokens: 4096 } },
      },
    });
  });

  it('leaves self-hosted models alone unless a level is picked', () => {
    expect(
      service.reasoningOptions({ provider: LLMProvider.CUSTOM, model: 'qwen3' }),
    ).toEqual({});
    expect(
      service.reasoningOptions({
        provider: LLMProvider.CUSTOM,
        model: 'qwen3',
        reasoningEffort: ReasoningEffort.LOW,
      }),
    ).toEqual({
      providerOptions: {
        openai: { reasoningEffort: 'low', reasoningSummary: 'auto' },
      },
    });
  });

  it('keeps working without a catalog file', async () => {
    jest.spyOn(fs, 'readFile').mockRejectedValueOnce(new Error('ENOENT'));
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const empty = new AgentsModelsCatalogService();
    await empty.onModuleInit();

    expect(warn).toHaveBeenCalled();
    expect(empty.resolveWindow(cfg(LLMProvider.OPENAI, 'gpt-5')).source).toBe(
      'default',
    );
  });
});
