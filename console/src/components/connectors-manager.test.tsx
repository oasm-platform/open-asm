import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorsManager } from './connectors-manager';

const getManyToolsMock = vi.fn();
const closeMock = vi.fn();
const installMock = vi.fn(
  (_vars: unknown, options?: { onSuccess?: () => void }) =>
    options?.onSuccess?.(),
);

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({
    state: { selectedWorkspaceId: 'workspace-1' },
  }),
  useWorkspaceSelector: () => ({
    workspaces: [{ id: 'workspace-1', name: 'Workspace 1' }],
    selectedWorkspace: 'workspace-1',
  }),
}));

vi.mock('@/hooks/useAgentSettingsDialog', () => ({
  useAgentSettingsDialog: () => ({ close: closeMock }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/services/apis/gen/queries')
  >();
  return {
    ...actual,
    useToolsControllerGetManyTools: (...args: unknown[]) =>
      getManyToolsMock(...args),
    useToolsControllerGetConnectorBySlug: () => ({ data: undefined }),
    useToolsControllerInstallTool: () => ({
      mutate: (vars: unknown, options?: { onSuccess?: () => void }) =>
        installMock(vars, options),
      isPending: false,
    }),
    useToolsControllerUninstallTool: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
  };
});

const tool = (name: string, isInstalled = false) => ({
  id: `id-${name}`,
  name,
  category: 'vulnerabilities',
  description: `${name} description`,
  logoUrl: null,
  agentTool: true,
  type: 'connector',
  isInstalled,
});

describe('ConnectorsManager', () => {
  beforeEach(() => {
    getManyToolsMock.mockReset();
    closeMock.mockReset();
    installMock.mockClear();
  });

  it('lists the agent tools of the workspace', async () => {
    getManyToolsMock.mockReturnValue({
      data: { data: [tool('subfinder'), tool('acunetix')] },
      isLoading: false,
    });

    renderWithProviders(<ConnectorsManager />);

    expect(await screen.findByText('subfinder')).toBeInTheDocument();
    expect(screen.getByText('acunetix')).toBeInTheDocument();
    expect(getManyToolsMock).toHaveBeenCalledWith(
      { agentTool: true, limit: 100 },
      { query: { enabled: true } },
    );
  });

  it('closes the dialog when a tool card is opened', async () => {
    getManyToolsMock.mockReturnValue({
      data: { data: [tool('subfinder')] },
      isLoading: false,
    });

    const { user } = renderWithProviders(<ConnectorsManager />);
    await user.click(await screen.findByRole('button', { name: 'subfinder' }));

    await waitFor(() => expect(closeMock).toHaveBeenCalled());
  });

  it('shows an install button per tool card', async () => {
    getManyToolsMock.mockReturnValue({
      data: { data: [tool('subfinder'), tool('acunetix', true)] },
      isLoading: false,
    });

    renderWithProviders(<ConnectorsManager />);

    expect(
      await screen.findByRole('button', { name: 'Install' }),
    ).toBeInTheDocument();
    // Installed connectors get a split Config button instead of "Installed"
    expect(screen.getByRole('button', { name: 'Config' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Installed' })).toBeNull();
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('puts uninstall in the menu next to Config', async () => {
    getManyToolsMock.mockReturnValue({
      data: { data: [tool('acunetix', true)] },
      isLoading: false,
    });

    const { user } = renderWithProviders(<ConnectorsManager />);
    await user.click(
      await screen.findByRole('button', { name: 'More actions' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Uninstall' }));

    expect(
      await screen.findByText('Are you sure you want to remove "acunetix"?'),
    ).toBeInTheDocument();
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('installs a connector without leaving for its configuration', async () => {
    getManyToolsMock.mockReturnValue({
      data: { data: [tool('subfinder')] },
      isLoading: false,
    });

    const { user } = renderWithProviders(<ConnectorsManager />);
    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const confirm = await screen.findAllByRole('button', { name: 'Install' });
    await user.click(confirm[confirm.length - 1]);

    await waitFor(() =>
      expect(installMock).toHaveBeenCalledWith(
        { data: { toolId: 'id-subfinder' } },
        expect.anything(),
      ),
    );
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('shows an empty state without tools', async () => {
    getManyToolsMock.mockReturnValue({ data: { data: [] }, isLoading: false });

    renderWithProviders(<ConnectorsManager />);

    expect(
      await screen.findByText('No tools available to the agent yet.'),
    ).toBeInTheDocument();
  });
});
