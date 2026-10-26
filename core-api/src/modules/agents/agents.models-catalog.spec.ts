import { Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { AgentsModelsCatalogService } from './agents.models-catalog';
import { LLMProvider } from './enums/agent.enums';

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

  it('uses OrcaRouter route windows instead of a bare-id guess', () => {
    expect(
      service.resolveWindow(cfg(LLMProvider.ORCAROUTER, 'orcarouter/auto')),
    ).toEqual({ tokens: 200_000, source: 'catalog', estimated: false });
    expect(
      service.resolveWindow(cfg(LLMProvider.ORCAROUTER, 'orca/orcacyber-ultra-1.0'))
        .tokens,
    ).toBe(1_048_576);
    expect(
      service.resolveWindow(cfg(LLMProvider.ORCAROUTER, 'orcarouter/new-route')),
    ).toEqual({ tokens: 128_000, source: 'default', estimated: true });
    // Vendor ids still resolve through models.dev
    expect(
      service.resolveWindow(cfg(LLMProvider.ORCAROUTER, 'openai/gpt-5')),
    ).toMatchObject({ source: 'catalog', estimated: false });
  });

  it('falls back to 128k for unknown models', () => {
    expect(
      service.resolveWindow(cfg(LLMProvider.OPENAI, 'no-such-model-xyz')),
    ).toEqual({ tokens: 128_000, source: 'default', estimated: true });
  });

  it('prices hosted models but not self-hosted ones', () => {
    expect(service.costOf(LLMProvider.ANTHROPIC, 'claude-sonnet-4-5')).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number),
    });
    expect(service.costOf(LLMProvider.CUSTOM, 'gpt-5')).toBeUndefined();
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
