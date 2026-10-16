import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorsManager } from './connectors-manager';

const getManyToolsMock = vi.fn();
const closeMock = vi.fn();

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({
    state: { selectedWorkspaceId: 'workspace-1' },
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
  };
});

const tool = (name: string) => ({
  id: `id-${name}`,
  name,
  categories: [{ name: 'vulnerabilities', targetTypes: [] }],
  description: `${name} description`,
  logoUrl: null,
  agentTool: true,
});

describe('ConnectorsManager', () => {
  beforeEach(() => {
    getManyToolsMock.mockReset();
    closeMock.mockReset();
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
    await user.click(await screen.findByRole('button', { name: /subfinder/ }));

    await waitFor(() => expect(closeMock).toHaveBeenCalled());
  });

  it('shows an empty state without tools', async () => {
    getManyToolsMock.mockReturnValue({ data: { data: [] }, isLoading: false });

    renderWithProviders(<ConnectorsManager />);

    expect(
      await screen.findByText('No tools available to the agent yet.'),
    ).toBeInTheDocument();
  });
});
