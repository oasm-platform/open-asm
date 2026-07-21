import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import AgentsLandingPage from '@/pages/agents/agents-landing';

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: vi.fn(() => ({
    state: { selectedWorkspaceId: 'workspace-1' },
  })),
}));

vi.mock('@/hooks/use-llm-configs', () => ({
  useLLMConfigs: vi.fn(() => ({
    providers: [],
    connectedProviders: [],
    preferredProvider: undefined,
    hasProviderConnected: false,
    isLoading: false,
  })),
}));

vi.mock('@/services/apis/gen/queries', async () => {
  const actual = await vi.importActual('@/services/apis/gen/queries');
  return {
    ...actual,
    useAgentsControllerGetConversations: vi.fn(() => ({
      data: { data: [] },
    })),
  };
});

vi.mock('@/components/agent-settings-dialog', () => ({
  AgentSettingsDialog: () => <div data-testid="agent-settings-dialog">AgentSettingsDialog</div>,
}));

vi.mock('@/components/typewriter-text', () => ({
  default: ({ texts }: { texts: string[] }) => (
    <div data-testid="typewriter-text">{texts[0]}</div>
  ),
}));

vi.mock('@/components/agent-prompt-input', () => ({
  default: () => <div data-testid="agent-prompt-input">AgentPromptInput</div>,
}));

vi.mock('@/components/ai-elements/suggestion', () => ({
  Suggestion: ({ suggestion }: { suggestion: string }) => (
    <button data-testid="suggestion">{suggestion}</button>
  ),
  Suggestions: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="suggestions">{children}</div>
  ),
}));

describe('Agents Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders agents landing page', async () => {
    const { useLLMConfigs } = await import('@/hooks/use-llm-configs');
    vi.mocked(useLLMConfigs).mockReturnValue({
      providers: [{ isConnected: true, configId: '1', providerId: 'openai', model: 'gpt-4' }],
      connectedProviders: [{ isConnected: true, configId: '1', providerId: 'openai', model: 'gpt-4' }],
      preferredProvider: undefined,
      hasProviderConnected: true,
      isLoading: false,
    } as unknown as ReturnType<typeof useLLMConfigs>);

    renderWithProviders(<AgentsLandingPage />, {
      routePath: '/_authed/agents/',
      initialEntries: ['/_authed/agents/'],
    });

    await waitFor(() => {
      expect(screen.getByTestId('typewriter-text')).toBeInTheDocument();
      expect(screen.getByTestId('agent-prompt-input')).toBeInTheDocument();
    });
  });

  it('shows connect provider when no LLM provider connected', async () => {
    const { useLLMConfigs } = await import('@/hooks/use-llm-configs');
    vi.mocked(useLLMConfigs).mockReturnValue({
      providers: [],
      connectedProviders: [],
      preferredProvider: undefined,
      hasProviderConnected: false,
      isLoading: false,
    } as unknown as ReturnType<typeof useLLMConfigs>);

    renderWithProviders(<AgentsLandingPage />, {
      routePath: '/_authed/agents/',
      initialEntries: ['/_authed/agents/'],
    });

    await waitFor(() => {
      expect(screen.getByText('Connect an AI Provider')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    });
  });

  it('shows recent conversations when available', async () => {
    const { useLLMConfigs } = await import('@/hooks/use-llm-configs');
    const { useAgentsControllerGetConversations } = await import(
      '@/services/apis/gen/queries'
    );

    vi.mocked(useLLMConfigs).mockReturnValue({
      providers: [{ isConnected: true, configId: '1', providerId: 'openai', model: 'gpt-4' }],
      connectedProviders: [{ isConnected: true, configId: '1', providerId: 'openai', model: 'gpt-4' }],
      preferredProvider: undefined,
      hasProviderConnected: true,
      isLoading: false,
    } as unknown as ReturnType<typeof useLLMConfigs>);

    vi.mocked(useAgentsControllerGetConversations).mockReturnValue({
      data: {
        data: [
          { id: 'conv-1', title: 'Test Conversation 1', updatedAt: '2026-01-01' },
          { id: 'conv-2', title: 'Test Conversation 2', updatedAt: '2026-01-02' },
        ],
      },
    } as ReturnType<typeof useAgentsControllerGetConversations>);

    renderWithProviders(<AgentsLandingPage />, {
      routePath: '/_authed/agents/',
      initialEntries: ['/_authed/agents/'],
    });

    await waitFor(() => {
      expect(screen.getByText('Recent conversations')).toBeInTheDocument();
      expect(screen.getByText('Test Conversation 1')).toBeInTheDocument();
      expect(screen.getByText('Test Conversation 2')).toBeInTheDocument();
    });
  });
});
