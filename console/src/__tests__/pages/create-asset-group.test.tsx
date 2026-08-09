import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { CreateAssetGroup } from '@/pages/asset-group/create-asset-group';

const mockHosts = [
  {
    id: 'asset-1',
    host: 'https://example.com',
    targetId: 't-1',
    isEnabled: true,
    assetCount: 3,
  },
  {
    id: 'asset-2',
    host: 'https://api.example.com',
    targetId: 't-2',
    isEnabled: true,
    assetCount: 1,
  },
];

const mockTools = [
  {
    id: 'tool-1',
    name: 'Subdomain scan',
    description: 'Enumerate subdomains',
    category: 'subdomains',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tool-2',
    name: 'Port scan',
    description: 'Scan open ports',
    category: 'ports_scanner',
    createdAt: '2026-01-02T00:00:00Z',
  },
];

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

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

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/services/apis/gen/queries')
  >();
  return {
    ...actual,
    useAssetsControllerGetHostAssets: () => ({
      data: { data: mockHosts, total: mockHosts.length, page: 1, limit: 10 },
      isLoading: false,
    }),
    useToolsControllerGetInstalledTools: () => ({
      data: { data: mockTools, total: mockTools.length },
      isLoading: false,
    }),
    useAssetGroupControllerCreate: () => ({
      mutate: createMock,
      isPending: false,
    }),
  };
});

beforeEach(() => {
  createMock.mockReset();
  // Resolve the create call with an id so the page navigates to the detail page
  createMock.mockImplementation(
    (
      _vars: unknown,
      opts?: { onSuccess?: (response: { id: string }) => void },
    ) => {
      opts?.onSuccess?.({ id: 'group-1' });
    },
  );
});

describe('CreateAssetGroup wizard page', () => {
  it('renders step 1 with name input and color palette; Next disabled until name entered', async () => {
    const { user } = renderWithProviders(<CreateAssetGroup />, {
      routePath: '/groups/create',
    });

    // Step indicator + form fields
    expect(await screen.findByText(/Info/)).toBeInTheDocument();
    const nameInput = screen.getByLabelText('Name');
    expect(nameInput).toBeInTheDocument();
    expect(screen.getByLabelText('Select #78716C color')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.type(nameInput, 'My Group');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('navigates to /groups when Cancel is clicked', async () => {
    const { user, router } = renderWithProviders(<CreateAssetGroup />, {
      routePath: '/groups/create',
    });

    await user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/groups');
    });
  });

  it('walks all steps, selects hosts and tools, and saves a merged DTO', async () => {
    const { user, router } = renderWithProviders(<CreateAssetGroup />, {
      routePath: '/groups/create',
    });

    // Step 1 -> 2
    await user.type(await screen.findByLabelText('Name'), 'My Group');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: hosts table with row selection
    await user.click(await screen.findByText('https://example.com'));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 3: tools selector (logo grid) with toggle selection
    expect(await screen.findByText('Port scan')).toBeInTheDocument();
    await user.click(screen.getByText('Subdomain scan'));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 4: schedule builder; Next becomes Save
    expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const dto = createMock.mock.calls[0][0].data;
    expect(dto).toMatchObject({
      name: 'My Group',
      hostIds: ['asset-1'],
      toolIds: ['tool-1'],
    });
    expect(dto.schedule).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/groups/group-1');
    });
  });

  it('goes back to the previous step with Back and keeps entered values', async () => {
    const { user } = renderWithProviders(<CreateAssetGroup />, {
      routePath: '/groups/create',
    });

    await user.type(await screen.findByLabelText('Name'), 'My Group');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('https://example.com');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toHaveValue('My Group');
    });
  });
});
