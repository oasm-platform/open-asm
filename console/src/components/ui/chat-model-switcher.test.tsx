import { renderWithProviders, screen } from '@/test/utils';
import { describe, expect, it, vi } from 'vitest';
import { ChatModelSwitcher } from './chat-model-switcher';

vi.mock('@/hooks/useAgentSettingsDialog', () => ({
  useAgentSettingsDialog: () => ({ open: vi.fn() }),
}));

vi.mock('@/hooks/use-llm-configs', () => ({
  useLLMConfigs: () => ({
    connectedProviders: [
      {
        configId: 'config-1',
        providerId: 'openai',
        providerName: 'OpenAI',
        model: 'gpt-4',
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
      data: [],
      isLoading: false,
    }),
    useAgentsControllerUpdateLLMConfig: () => ({ mutate: vi.fn() }),
  };
});

const props = {
  selectedConfigId: 'config-1',
  selectedModel: 'gpt-4',
  onSelectModel: vi.fn(),
};

describe('ChatModelSwitcher', () => {
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
