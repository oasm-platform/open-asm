import { renderWithProviders, screen } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstructionManager } from './instruction-manager';

const mutate = vi.fn();

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useAgentsControllerGetAgentConfig: vi.fn(),
  useAgentsControllerUpsertAgentConfig: () => ({ mutate, isPending: false }),
}));

async function setup(instruction: string | null) {
  const { useAgentsControllerGetAgentConfig } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useAgentsControllerGetAgentConfig).mockReturnValue({
    data: { instruction, searchProviders: [], modelsConfig: {} },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useAgentsControllerGetAgentConfig>);
  return renderWithProviders(<InstructionManager />);
}

describe('InstructionManager', () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it('shows the saved instruction and saves only after an edit', async () => {
    await setup('Be brief.');

    const input = await screen.findByRole('textbox', { name: 'Instruction' });
    expect(input).toHaveValue('Be brief.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves the trimmed instruction', async () => {
    const { user } = await setup(null);

    const input = await screen.findByRole('textbox', { name: 'Instruction' });
    await user.type(input, '  Use tables.  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith(
      { data: { instruction: 'Use tables.' } },
      expect.anything(),
    );
  });

  it('clears the instruction when emptied', async () => {
    const { user } = await setup('Be brief.');

    await user.clear(await screen.findByRole('textbox', { name: 'Instruction' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith(
      { data: { instruction: null } },
      expect.anything(),
    );
  });

  it('discards the draft', async () => {
    const { user } = await setup('Be brief.');

    const input = await screen.findByRole('textbox', { name: 'Instruction' });
    await user.type(input, ' More.');
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(input).toHaveValue('Be brief.');
    expect(mutate).not.toHaveBeenCalled();
  });
});
