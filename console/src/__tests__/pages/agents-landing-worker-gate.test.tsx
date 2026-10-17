import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import AgentsLandingPage from '@/pages/agents/agents-landing';

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

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => mockNavigate,
  useSearch: () => ({}),
}));

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: vi.fn(() => ({
    state: { selectedWorkspaceId: 'workspace-1' },
  })),
}));

vi.mock('@/hooks/use-llm-configs', () => ({
  useLLMConfigs: vi.fn(() => ({ hasProviderConnected: true })),
}));

const mockOpenDialog = vi.fn();
vi.mock('@/hooks/useConnectWorkerState', () => ({
  useConnectWorkerState: () => ({ openDialog: mockOpenDialog }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  agentsControllerGetAgentModes: vi.fn(),
}));

vi.mock('@/components/typewriter-text', () => ({ default: () => null }));
vi.mock('@/components/ui/border-beam', () => ({ default: () => null }));

// Exposes the page's submit handler as a button.
vi.mock('@/components/agent-prompt-input', () => ({
  default: ({
    onSubmit,
  }: {
    onSubmit: (content: string, options?: { agentMode?: string }) => void;
  }) => (
    <button type="button" onClick={() => onSubmit('scan example.com')}>
      Send
    </button>
  ),
}));

const { agentsControllerGetAgentModes } = await import(
  '@/services/apis/gen/queries'
);
const mockModes = vi.mocked(agentsControllerGetAgentModes);
const modes = (ids: string[]) =>
  ({ modes: [], workers: ids.map((id) => ({ id })) }) as unknown as Awaited<
    ReturnType<typeof agentsControllerGetAgentModes>
  >;

const renderLanding = (mode: 'ask' | 'agent') =>
  renderWithProviders(<AgentsLandingPage initialAgentMode={mode} />, {
    routePath: '/_authed/aistudio/agents',
    initialEntries: ['/_authed/aistudio/agents'],
  });

describe('Agents landing — worker gate on submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the connect dialog when agent mode has no online worker, then sends with the joined one', async () => {
    mockModes.mockResolvedValue(modes([]));
    renderLanding('agent');

    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));

    await waitFor(() => expect(mockOpenDialog).toHaveBeenCalledTimes(1));
    expect(mockNavigate).not.toHaveBeenCalled();

    // The worker joins and becomes ready for agents.
    mockModes.mockResolvedValue(modes(['w-new']));
    const onJoined = mockOpenDialog.mock.calls[0][1] as (id: string) => void;
    onJoined('w-new');

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(mockNavigate.mock.calls[0][0].state).toMatchObject({
      pendingMessage: 'scan example.com',
      agentMode: 'agent',
      workerId: 'w-new',
    });
  });

  it('sends straight away with Auto when a worker is online', async () => {
    mockModes.mockResolvedValue(modes(['w-online']));
    renderLanding('agent');

    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(mockOpenDialog).not.toHaveBeenCalled();
    expect(mockNavigate.mock.calls[0][0].state).toMatchObject({
      workerId: null,
    });
  });

  it('never checks workers in ask mode', async () => {
    renderLanding('ask');

    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(mockModes).not.toHaveBeenCalled();
    expect(mockOpenDialog).not.toHaveBeenCalled();
  });
});
