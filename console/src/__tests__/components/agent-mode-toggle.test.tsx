import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { AgentModeToggle } from '@/components/ui/agent-mode-toggle';
import { renderWithProviders, screen } from '@/test/utils';

vi.mock('@/hooks/use-live-events', () => ({
  useLiveEvents: vi.fn(),
}));

const mockOpenDialog = vi.fn();
vi.mock('@/hooks/useConnectWorkerState', () => ({
  useConnectWorkerState: () => ({ openDialog: mockOpenDialog }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/apis/gen/queries')>();
  return {
    ...actual,
    useAgentsControllerGetAgentModes: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const { useAgentsControllerGetAgentModes } = await import(
  '@/services/apis/gen/queries'
);
const mockModes = vi.mocked(useAgentsControllerGetAgentModes);

const modes = (workerIds: string[]) =>
  ({
    data: { modes: [], workers: workerIds.map((id) => ({ id, name: id })) },
    isSuccess: true,
    isFetching: false,
    refetch: vi.fn(),
  }) as unknown as ReturnType<typeof useAgentsControllerGetAgentModes>;

describe('AgentModeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switches ask to agent from the toggle', async () => {
    mockModes.mockReturnValue(modes(['w-online']));
    const onChange = vi.fn();

    renderWithProviders(<AgentModeToggle value="ask" onChange={onChange} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Agent' }));

    expect(onChange).toHaveBeenCalledWith('agent');
  });

  it('opens the connect dialog instead of switching when no worker is online', async () => {
    mockModes.mockReturnValue(modes([]));
    const onChange = vi.fn();

    renderWithProviders(<AgentModeToggle value="ask" onChange={onChange} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Agent' }));

    expect(mockOpenDialog).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears the picked worker when switching back to ask', async () => {
    mockModes.mockReturnValue(modes(['w-online']));
    const onWorkerChange = vi.fn();

    renderWithProviders(
      <AgentModeToggle
        value="agent"
        onChange={vi.fn()}
        onWorkerChange={onWorkerChange}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Agent' }));

    expect(onWorkerChange).toHaveBeenCalledWith(null);
  });
});
