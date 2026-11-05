import { renderWithProviders, screen } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatModelSwitcher } from './chat-model-switcher';

vi.mock('@/hooks/useAgentSettingsDialog', () => ({
  useAgentSettingsDialog: () => ({ open: vi.fn() }),
}));

const mutate = vi.fn();
let models: Array<{ id: string; name: string; reasoningEfforts: string[] }> =
  [];

vi.mock('@/hooks/use-llm-configs', () => ({
  useLLMConfigs: () => ({
    connectedProviders: [
      {
        configId: 'config-1',
        providerId: 'openai',
        providerName: 'OpenAI',
        model: 'gpt-4',
        reasoningEffort: 'low',
        isPreferred: true,
      },
    ],
  }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/services/apis/gen/queries')
  >();
  return {
    ...actual,
    useAgentsControllerGetProviderModels: () => ({
      data: models,
      isLoading: false,
    }),
    useAgentsControllerUpdateLLMConfig: () => ({ mutate }),
  };
});

const props = {
  selectedConfigId: 'config-1',
  selectedModel: 'gpt-4',
  onSelectModel: vi.fn(),
};

describe('ChatModelSwitcher', () => {
  beforeEach(() => {
    mutate.mockClear();
    models = [];
  });

  it("offers the model's own effort levels and saves the pick on the connection", async () => {
    models = [
      {
        id: 'gpt-4',
        name: 'GPT-4',
        reasoningEfforts: ['minimal', 'low', 'medium', 'high'],
      },
    ];
    renderWithProviders(<ChatModelSwitcher {...props} />);

    const trigger = await screen.findByRole('button', {
      name: 'Reasoning effort',
    });
    expect(trigger).toHaveTextContent('Low');

    await userEvent.click(trigger);
    expect(
      await screen.findByRole('menuitem', { name: 'Minimal' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'High' }));

    expect(mutate).toHaveBeenCalledWith(
      { id: 'config-1', data: { reasoningEffort: 'high' } },
      expect.any(Object),
    );
    expect(trigger).toHaveTextContent('High');
  });

  it('falls back to low, medium and high when the model lists none', async () => {
    renderWithProviders(<ChatModelSwitcher {...props} />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Reasoning effort' }),
    );
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Default'),
      'Low',
      'Medium',
      'High',
    ]);
  });

  it('shows the agent settings gear by default', async () => {
    renderWithProviders(<ChatModelSwitcher {...props} />);

    expect(
      await screen.findByRole('button', { name: 'Agent settings' }),
    ).toBeInTheDocument();
  });

  it('hides the gear with showSettingsButton={false}', async () => {
    renderWithProviders(
      <ChatModelSwitcher {...props} showSettingsButton={false} />,
    );

    expect(
      await screen.findByRole('button', { name: 'Select model' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Agent settings' }),
    ).not.toBeInTheDocument();
  });
});
