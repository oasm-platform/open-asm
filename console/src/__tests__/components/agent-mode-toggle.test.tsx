import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentModeSelect } from '@/components/ui/agent-mode-toggle';
import { renderWithProviders } from '@/test/utils';
import { toast } from 'sonner';

vi.mock('@/hooks/use-live-events', () => ({
  useLiveEvents: vi.fn(),
}));

vi.mock('@/components/ui/approval-mode-select', () => ({
  ApprovalModeSelect: () => null,
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

const modes = (workerIds: string[], isFetching = false) =>
  ({
    data: { modes: [], workers: workerIds.map((id) => ({ id, name: id })) },
    isSuccess: true,
    isFetching,
    refetch: vi.fn(),
  }) as unknown as ReturnType<typeof useAgentsControllerGetAgentModes>;

describe('AgentModeSelect worker pick', () => {
  const onWorkerChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const render = (selectedWorkerId: string | null) =>
    renderWithProviders(
      <AgentModeSelect
        value="agent"
        selectedWorkerId={selectedWorkerId}
        onWorkerChange={onWorkerChange}
      />,
    );

  it('falls back to Auto when the selected worker is no longer online', async () => {
    mockModes.mockReturnValue(modes(['w-online']));

    render('w-gone');

    await vi.waitFor(() => expect(onWorkerChange).toHaveBeenCalledWith(null));
    expect(toast.info).toHaveBeenCalled();
  });

  it('keeps a selected worker that is still online', async () => {
    mockModes.mockReturnValue(modes(['w-online']));

    render('w-online');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onWorkerChange).not.toHaveBeenCalled();
  });

  it('waits for a refetch in flight before deciding', async () => {
    mockModes.mockReturnValue(modes([], true));

    render('w-online');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onWorkerChange).not.toHaveBeenCalled();
  });
});
