import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { AgentToolsTray } from '@/pages/agents/components/agent-tools-tray';

const getManyToolsMock = vi.fn();
const openSettingsMock = vi.fn();
const motion = vi.hoisted(() => ({ reduce: false }));

// Reduced motion skips exit animations, which never finish under jsdom.
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => motion.reduce,
}));

vi.mock('@/hooks/useAgentSettingsDialog', () => ({
  useAgentSettingsDialog: () => ({ open: openSettingsMock }),
}));

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: vi.fn(() => ({
    state: { selectedWorkspaceId: 'workspace-1' },
  })),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/services/apis/gen/queries')
  >();
  return {
    ...actual,
    useToolsControllerGetManyTools: (...args: unknown[]) =>
      getManyToolsMock(...args),
    useAgentsControllerGetAgentModes: () => ({
      data: { workers: [{ id: 'worker-1' }] },
    }),
  };
});

const tool = (name: string) => ({ id: `id-${name}`, name, logoUrl: null });

describe('AgentToolsTray', () => {
  beforeEach(() => {
    getManyToolsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    motion.reduce = false;
  });

  it('asks for every agent tool (the logos rotate through them)', async () => {
    getManyToolsMock.mockReturnValue({ data: { data: [] } });

    renderWithProviders(
      <AgentToolsTray agentMode="ask" onAgentModeChange={vi.fn()} />,
    );

    await waitFor(() =>
      expect(getManyToolsMock).toHaveBeenCalledWith(
        { agentTool: true, limit: 100 },
        { query: { enabled: true } },
      ),
    );
  });

  it('shows 5 logos and the first name (capitalized), then moves one step per second', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getManyToolsMock.mockReturnValue({
      data: { data: ['t1', 't2', 't3', 't4', 't5', 't6', 't7'].map(tool) },
    });

    renderWithProviders(
      <AgentToolsTray agentMode="ask" onAgentModeChange={vi.fn()} />,
    );

    expect(await screen.findByText('T1')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 't5' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 't6' })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(await screen.findByText('T2')).toBeInTheDocument();
    expect(
      await screen.findByRole('img', { name: 't6' }),
    ).toBeInTheDocument();
  });

  it('stops after 10 steps and settles on the Connectors label', async () => {
    motion.reduce = true;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getManyToolsMock.mockReturnValue({
      data: { data: ['t1', 't2', 't3', 't4', 't5', 't6', 't7'].map(tool) },
    });

    renderWithProviders(
      <AgentToolsTray agentMode="ask" onAgentModeChange={vi.fn()} />,
    );
    expect(await screen.findByText('T1')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(9000);
    });
    expect(screen.queryByText('Connectors')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(await screen.findByText('Connectors')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryAllByRole('img')).toHaveLength(0),
    );

    // Settled for good: no further rotation.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('Connectors')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agent tools' })).toBeInTheDocument();
  });

  it('shows the Agent toggle and one logo per tool', async () => {
    getManyToolsMock.mockReturnValue({
      data: { data: ['subfinder', 'httpx', 'nuclei'].map(tool) },
    });

    renderWithProviders(
      <AgentToolsTray agentMode="ask" onAgentModeChange={vi.fn()} />,
    );

    expect(
      await screen.findByRole('button', { name: 'Agent' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'subfinder' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'httpx' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'nuclei' })).toBeInTheDocument();
    // No tool-name tooltip on hover
    expect(screen.getByRole('img', { name: 'subfinder' })).toHaveAttribute(
      'title',
      '',
    );
  });

  it('switches to agent mode from the toggle', async () => {
    getManyToolsMock.mockReturnValue({ data: { data: [] } });
    const onAgentModeChange = vi.fn();

    renderWithProviders(
      <AgentToolsTray agentMode="ask" onAgentModeChange={onAgentModeChange} />,
    );
    (await screen.findByRole('button', { name: 'Agent' })).click();

    expect(onAgentModeChange).toHaveBeenCalledWith('agent');
  });

  it('opens the Connectors tab of the agent settings from the logos', async () => {
    getManyToolsMock.mockReturnValue({ data: { data: [tool('subfinder')] } });

    renderWithProviders(
      <AgentToolsTray agentMode="ask" onAgentModeChange={vi.fn()} />,
    );
    (await screen.findByRole('button', { name: 'Agent tools' })).click();

    expect(openSettingsMock).toHaveBeenCalledWith('connectors');
  });
});
