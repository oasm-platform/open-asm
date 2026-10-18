import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelsManager } from './models-manager';

// jsdom has no ResizeObserver; cmdk's list measures itself with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

type MutateOptions = { onSettled?: () => void };
/** Settles right away unless a test holds the save open. */
const mutate = vi.fn(
  (
    _vars: { data: { modelsConfig: Record<string, unknown> } },
    options?: MutateOptions,
  ) => options?.onSettled?.(),
);
const openSettings = vi.fn();

const MODELS: Record<string, Array<{ id: string; name: string }>> = {
  c1: [
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-5-mini', name: 'GPT-5 mini' },
  ],
  c2: [{ id: 'claude-haiku', name: 'Claude Haiku' }],
};

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/hooks/useAgentSettingsDialog', () => ({
  useAgentSettingsDialog: () => ({ open: openSettings }),
}));

vi.mock('@/hooks/use-llm-configs', () => ({
  useLLMConfigs: vi.fn(),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useAgentsControllerGetAgentConfig: vi.fn(),
  useAgentsControllerUpsertAgentConfig: () => ({ mutate, isPending: false }),
  getAgentsControllerGetProviderModelsQueryOptions: (
    id: string,
    options?: { query?: { enabled?: boolean } },
  ) => ({
    queryKey: ['models', id],
    queryFn: () => Promise.resolve(MODELS[id]),
    enabled: options?.query?.enabled,
  }),
}));

const CONNECTIONS = [
  {
    configId: 'c1',
    providerId: 'openai',
    providerName: 'OpenAI',
    logo: '/static/images/openai.svg',
    isConnected: true,
  },
  { configId: 'c2', providerId: 'anthropic', providerName: 'Anthropic', isConnected: true },
];

async function setup(
  modelsConfig: Record<string, unknown> | null,
  connections: unknown[] = CONNECTIONS,
) {
  const { useLLMConfigs } = await import('@/hooks/use-llm-configs');
  vi.mocked(useLLMConfigs).mockReturnValue({
    connectedProviders: connections,
    isLoading: false,
  } as unknown as ReturnType<typeof useLLMConfigs>);
  const { useAgentsControllerGetAgentConfig } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useAgentsControllerGetAgentConfig).mockReturnValue({
    data: modelsConfig ? { modelsConfig } : undefined,
    isLoading: false,
    isError: !modelsConfig,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useAgentsControllerGetAgentConfig>);
  renderWithProviders(<ModelsManager />);
}

const DEFAULT = {
  llmConfigId: 'c1',
  model: 'gpt-5',
  contextWindow: 400000,
};

describe('ModelsManager', () => {
  beforeEach(() => {
    mutate.mockClear();
    openSettings.mockClear();
  });

  it('shows the saved models and unset choices', async () => {
    await setup({
      default: DEFAULT,
      subagents: [{ llmConfigId: 'c2', model: 'claude-haiku', reasoningEffort: 'high' }],
    });

    const defaultPicker = await screen.findByRole('combobox', {
      name: 'Default model',
    });
    expect(defaultPicker).toHaveTextContent('gpt-5');
    // Logos are served by the API, not by the console origin
    expect(defaultPicker.querySelector('img')).toHaveAttribute(
      'src',
      '/api/static/images/openai.svg',
    );
    expect(screen.getByRole('combobox', { name: 'Small model' })).toHaveTextContent(
      'Use default model',
    );
    expect(
      screen.getByRole('combobox', { name: 'Subagent model' }),
    ).toHaveTextContent('claude-haiku');
    expect(
      screen.getByRole('combobox', { name: 'Subagent reasoning effort' }),
    ).toHaveTextContent('High');
  });

  it('says what an unset default falls back to', async () => {
    await setup({});

    expect(
      await screen.findByRole('combobox', { name: 'Default model' }),
    ).toHaveTextContent('Not set (uses the first connection)');
  });

  it('offers a retry instead of an editable empty config when loading fails', async () => {
    await setup(null);

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('searches model names, not the connection ids in item values', async () => {
    const user = userEvent.setup();
    await setup({ default: DEFAULT });

    await user.click(await screen.findByRole('combobox', { name: 'Default model' }));
    await screen.findByRole('option', { name: 'Claude Haiku' });

    await user.type(screen.getByPlaceholderText('Search models...'), 'mini');
    await waitFor(() =>
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'GPT-5 mini',
      ]),
    );

    await user.clear(screen.getByPlaceholderText('Search models...'));
    await user.type(screen.getByPlaceholderText('Search models...'), 'c2');
    await waitFor(() =>
      expect(screen.queryAllByRole('option')).toHaveLength(0),
    );
  });

  it('ignores a pick made while the previous save is still running', async () => {
    const user = userEvent.setup();
    await setup({ default: DEFAULT });
    mutate.mockImplementationOnce(() => {}); // never settles

    await user.click(await screen.findByRole('combobox', { name: 'Small model' }));
    await user.click(await screen.findByRole('option', { name: 'Claude Haiku' }));
    await user.click(screen.getByRole('combobox', { name: 'Default model' }));
    await user.click(await screen.findByRole('option', { name: 'GPT-5 mini' }));

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('asks to connect a provider when there is none', async () => {
    const user = userEvent.setup();
    await setup({}, []);

    await user.click(
      await screen.findByRole('button', { name: 'Connect a provider' }),
    );

    expect(openSettings).toHaveBeenCalledWith('provider');
  });

  it('saves a picked small model with the rest of the models unchanged', async () => {
    const user = userEvent.setup();
    await setup({ default: DEFAULT });

    await user.click(await screen.findByRole('combobox', { name: 'Small model' }));
    await user.click(await screen.findByRole('option', { name: 'Claude Haiku' }));

    expect(mutate).toHaveBeenCalledWith(
      {
        data: {
          modelsConfig: {
            default: DEFAULT,
            small: { llmConfigId: 'c2', model: 'claude-haiku' },
          },
        },
      },
      expect.anything(),
    );
  });

  it('drops the old limits when the default moves to another model', async () => {
    const user = userEvent.setup();
    await setup({ default: DEFAULT });

    await user.click(await screen.findByRole('combobox', { name: 'Default model' }));
    await user.click(await screen.findByRole('option', { name: 'GPT-5 mini' }));

    expect(mutate.mock.calls[0][0].data.modelsConfig.default).toEqual({
      llmConfigId: 'c1',
      model: 'gpt-5-mini',
    });
  });

  it('keeps the effort when the subagent model changes, and clears it on request', async () => {
    const user = userEvent.setup();
    const subagent = { llmConfigId: 'c2', model: 'claude-haiku', reasoningEffort: 'low' };
    await setup({ default: DEFAULT, subagents: [subagent] });

    await user.click(await screen.findByRole('combobox', { name: 'Subagent model' }));
    await user.click(await screen.findByRole('option', { name: 'GPT-5' }));
    expect(mutate.mock.calls[0][0].data.modelsConfig.subagents).toEqual([
      { llmConfigId: 'c1', model: 'gpt-5', reasoningEffort: 'low' },
    ]);

    await user.click(
      screen.getByRole('combobox', { name: 'Subagent reasoning effort' }),
    );
    await user.click(
      await screen.findByRole('option', { name: 'Not Set (Use Provider Default)' }),
    );
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
    expect(mutate.mock.calls[1][0].data.modelsConfig.subagents).toEqual([
      { llmConfigId: 'c2', model: 'claude-haiku' },
    ]);
  });

  it('clears every subagent model when set back to inherit', async () => {
    const user = userEvent.setup();
    await setup({
      default: DEFAULT,
      subagents: [
        { llmConfigId: 'c2', model: 'claude-haiku' },
        { llmConfigId: 'c1', model: 'gpt-5-mini' },
      ],
    });

    await user.click(await screen.findByRole('combobox', { name: 'Subagent model' }));
    await user.click(await screen.findByRole('option', { name: 'Inherit from agent' }));

    expect(mutate.mock.calls[0][0].data.modelsConfig.subagents).toEqual([]);
  });
});
