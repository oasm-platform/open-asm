import { renderWithProviders, screen } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryManager } from './memory-manager';

const mutate = vi.fn();
const deleteMemory = vi.fn();

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useAgentsControllerGetAgentConfig: vi.fn(),
  useAgentsControllerUpsertAgentConfig: () => ({ mutate, isPending: false }),
  useAgentsControllerGetWorkspaceMemory: vi.fn(),
  useAgentsControllerDeleteWorkspaceMemory: () => ({ mutate: deleteMemory }),
}));

const MEMORY = {
  id: 'm1',
  content: 'example.com runs WordPress 5.9',
  updatedAt: '2026-10-26T00:00:00Z',
};

async function setup(memoryEnabled?: boolean, memories = [MEMORY]) {
  const {
    useAgentsControllerGetAgentConfig,
    useAgentsControllerGetWorkspaceMemory,
  } = await import('@/services/apis/gen/queries');
  vi.mocked(useAgentsControllerGetAgentConfig).mockReturnValue({
    data: { memoryEnabled, searchProviders: [], modelsConfig: {} },
    isLoading: false,
  } as unknown as ReturnType<typeof useAgentsControllerGetAgentConfig>);
  vi.mocked(useAgentsControllerGetWorkspaceMemory).mockReturnValue({
    data: { data: memories },
    isLoading: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useAgentsControllerGetWorkspaceMemory>);
  return renderWithProviders(<MemoryManager />);
}

const memorySwitch = () =>
  screen.findByRole('switch', { name: 'Long-term memory' });

describe('MemoryManager', () => {
  beforeEach(() => {
    mutate.mockClear();
    deleteMemory.mockClear();
  });

  it('puts the on/off switch where the refresh button was', async () => {
    await setup(true);

    expect(await memorySwitch()).toBeChecked();
    expect(
      screen.queryByRole('button', { name: /refresh/i }),
    ).not.toBeInTheDocument();
  });

  it('shows memory as off without a saved setting', async () => {
    await setup(undefined, []);

    expect(await memorySwitch()).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Long-term memory is off',
    );
  });

  it('keeps saved memories visible but locked while off', async () => {
    await setup(false);

    expect(await screen.findByText(MEMORY.content)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'They are kept until deleted',
    );
    expect(screen.getByRole('button', { name: 'Delete memory' })).toBeDisabled();
  });

  it('lets the user manage memories while on', async () => {
    await setup(true);

    expect(await screen.findByText(MEMORY.content)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete memory' })).toBeEnabled();
  });

  it('turns memory off without deleting what is saved', async () => {
    const { user } = await setup(true);

    await user.click(await memorySwitch());

    expect(mutate).toHaveBeenCalledWith(
      { data: { memoryEnabled: false } },
      expect.anything(),
    );
    expect(deleteMemory).not.toHaveBeenCalled();
  });

  it('turns memory back on', async () => {
    const { user } = await setup(false);

    await user.click(await memorySwitch());

    expect(mutate).toHaveBeenCalledWith(
      { data: { memoryEnabled: true } },
      expect.anything(),
    );
  });
});
