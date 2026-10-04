import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from '@/services/apis/gen/queries';
import ToolInstallButton from './tool-install-button';

const mutationMocks = vi.hoisted(() => ({
  install: vi.fn(),
  uninstall: vi.fn(),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/apis/gen/queries')>();

  return {
    ...actual,
    useToolsControllerInstallTool: () => ({
      mutate: mutationMocks.install,
      isPending: false,
    }),
    useToolsControllerUninstallTool: () => ({
      mutate: mutationMocks.uninstall,
      isPending: false,
    }),
  };
});

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({
    onConfirm,
    trigger,
  }: {
    onConfirm: () => void;
    trigger: ReactNode;
  }) => (
    <div>
      {trigger}
      <button type="button" onClick={onConfirm}>
        Confirm action
      </button>
    </div>
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const tool = (isInstalled: boolean) =>
  ({
    id: 'tool-1',
    name: 'Nuclei',
    type: 'connector',
    isInstalled,
  }) as unknown as Tool;

describe('ToolInstallButton request body contract', () => {
  beforeEach(() => {
    mutationMocks.install.mockReset();
    mutationMocks.uninstall.mockReset();
  });

  it('omits the workspace id from the install request body', async () => {
    const user = userEvent.setup();
    render(<ToolInstallButton tool={tool(false)} workspaceId="workspace-1" />);

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(mutationMocks.install).toHaveBeenCalledWith(
      { data: { toolId: 'tool-1' } },
      expect.any(Object),
    );
  });

  it('omits the workspace id from the uninstall request body', async () => {
    const user = userEvent.setup();
    render(<ToolInstallButton tool={tool(true)} workspaceId="workspace-1" />);

    await user.click(screen.getByRole('button', { name: 'Confirm action' }));

    expect(mutationMocks.uninstall).toHaveBeenCalledWith(
      { data: { toolId: 'tool-1' } },
      expect.any(Object),
    );
  });
});
