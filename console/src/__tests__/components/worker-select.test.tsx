import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkerSelect } from '@/pages/agents/components/worker-select';
import { renderWithProviders } from '@/test/utils';
import { toast } from 'sonner';

vi.mock('@/hooks/use-live-events', () => ({
  useLiveEvents: vi.fn(),
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

describe('WorkerSelect', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const render = (value: string | null) =>
    renderWithProviders(<WorkerSelect value={value} onChange={onChange} />);

  it('falls back to Auto when the selected worker is no longer online', async () => {
    mockModes.mockReturnValue(modes(['w-online']));

    render('w-gone');

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(toast.info).toHaveBeenCalled();
  });

  it('keeps a selected worker that is still online', async () => {
    mockModes.mockReturnValue(modes(['w-online']));

    render('w-online');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('waits for a refetch in flight before deciding', async () => {
    mockModes.mockReturnValue(modes([], true));

    render('w-online');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onChange).not.toHaveBeenCalled();
  });
});
