import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import AgentsLandingPage from '@/pages/agents/agents-landing';

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: vi.fn(() => ({
    state: { selectedWorkspaceId: 'workspace-1' },
  })),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    permissions: ['*'],
    isOwner: true,
    hasPermission: () => true,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
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

vi.mock('@/components/typewriter-text', () => ({
  default: ({ texts }: { texts: string[] }) => (
    <div data-testid="typewriter-text">{texts[0]}</div>
  ),
}));

vi.mock('@/components/agent-prompt-input', () => ({
  default: () => <div data-testid="agent-prompt-input">AgentPromptInput</div>,
}));

// framer-motion never finishes animations under jsdom, so the test ends the
// beam's lap itself.
vi.mock('@/components/ui/border-beam', () => ({
  default: ({ onComplete }: { onComplete?: () => void }) => (
    <button type="button" data-testid="border-beam" onClick={onComplete}>
      Finish beam
    </button>
  ),
}));

vi.mock('@/pages/agents/components/agent-tools-tray', () => ({
  AgentToolsTray: ({
    onAgentModeChange,
  }: {
    onAgentModeChange: (mode: string) => void;
  }) => (
    <div data-testid="agent-tools-tray">
      <button type="button" onClick={() => onAgentModeChange('agent')}>
        Agent
      </button>
    </div>
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
      routePath: '/_authed/aistudio/',
      initialEntries: ['/_authed/aistudio/'],
    });

    await waitFor(() => {
      expect(screen.getByTestId('typewriter-text')).toBeInTheDocument();
      expect(screen.getByTestId('agent-prompt-input')).toBeInTheDocument();
      expect(screen.getByTestId('agent-tools-tray')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Vulnerabilities' }),
      ).toBeInTheDocument();
      // The gradient beam runs around the input as the page loads.
      expect(screen.getByTestId('border-beam')).toBeInTheDocument();
    });
  });

  it('fades in the halo once the load-time beam finishes', async () => {
    const { useLLMConfigs } = await import('@/hooks/use-llm-configs');
    vi.mocked(useLLMConfigs).mockReturnValue({
      providers: [{ isConnected: true, configId: '1', providerId: 'openai', model: 'gpt-4' }],
      connectedProviders: [{ isConnected: true, configId: '1', providerId: 'openai', model: 'gpt-4' }],
      preferredProvider: undefined,
      hasProviderConnected: true,
      isLoading: false,
    } as unknown as ReturnType<typeof useLLMConfigs>);

    renderWithProviders(<AgentsLandingPage />, {
      routePath: '/_authed/aistudio/',
      initialEntries: ['/_authed/aistudio/'],
    });

    const beam = await screen.findByTestId('border-beam');
    expect(screen.queryByTestId('landing-halo')).not.toBeInTheDocument();

    beam.click();

    const halo = await screen.findByTestId('landing-halo');
    expect(halo).toHaveAttribute('data-mode', 'ask');

    // Agent mode can run commands on workers: the halo turns orange.
    screen.getByRole('button', { name: 'Agent' }).click();
    await waitFor(() => expect(halo).toHaveAttribute('data-mode', 'agent'));
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
      routePath: '/_authed/aistudio/',
      initialEntries: ['/_authed/aistudio/'],
    });

    await waitFor(() => {
      expect(screen.getByText('Connect an AI Provider')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    });
  });
});
