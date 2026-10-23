import { generateText } from 'ai';
import { LLMProvider } from '../enums/agent.enums';
import { getLLMProviderConfig } from '../llm-provider-supported';
import { fetchOrcaRouterModels } from './orcarouter-models';

/**
 * Live gateway checks. They only run when a real key is supplied through
 * `ORCAROUTER_API_KEY` (CI and ordinary `pnpm test` runs skip them), and they
 * always go through the registered provider path rather than raw HTTP.
 */
const apiKey = process.env.ORCAROUTER_API_KEY;
const live = apiKey ? it : it.skip;

describe('OrcaRouter live gateway', () => {
  live(
    'lists chat models for the configured account',
    async () => {
      const models = await fetchOrcaRouterModels(apiKey as string);
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((model) => model.id.length > 0)).toBe(true);
    },
    60_000,
  );

  live(
    'answers through the registered provider handler',
    async () => {
      const provider = getLLMProviderConfig(LLMProvider.ORCAROUTER);
      const model = provider?.handler(
        apiKey as string,
        'deepseek/deepseek-v4-flash',
      );
      const { text } = await generateText({
        model: model as NonNullable<typeof model>,
        prompt: 'Reply with the single word: pong',
        maxOutputTokens: 16,
      });
      expect(text.toLowerCase()).toContain('pong');
    },
    90_000,
  );
});
