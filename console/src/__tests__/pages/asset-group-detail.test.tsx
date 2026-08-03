import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import AssetGroupDetail from '@/pages/asset-group/asset-group-detail';

const mockGroup = {
  id: 'group-1',
  name: 'Web Servers',
  hexColor: '#3b82f6',
  assetGroupWorkflows: [],
};

const mockStatistic = {
  totalAssets: 12,
  vulns: 5,
  criticalVuls: 1,
  highVuls: 2,
  mediumVuls: 1,
  lowVuls: 0,
  infoVuls: 1,
  ports: 15,
  services: 4,
};

const { removeManyMock, assetsRef } = vi.hoisted(() => {
  const baseAssets = [
    {
      id: 'asset-1',
      value: 'https://example.com',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      targetId: 't-1',
      isPrimary: true,
      isEnabled: true,
      dnsRecords: { A: ['1.2.3.4', '5.6.7.8'], AAAA: ['::1'] },
    },
    {
      id: 'asset-2',
      value: 'https://api.example.com',
      createdAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      targetId: 't-2',
      isPrimary: false,
      isEnabled: false,
      dnsRecords: null,
    },
  ];
  return { removeManyMock: vi.fn(), assetsRef: { value: baseAssets } };
});

const resetAssets = () => {
  assetsRef.value = [
    {
      id: 'asset-1',
      value: 'https://example.com',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      targetId: 't-1',
      isPrimary: true,
      isEnabled: true,
      dnsRecords: { A: ['1.2.3.4', '5.6.7.8'], AAAA: ['::1'] },
    },
    {
      id: 'asset-2',
      value: 'https://api.example.com',
      createdAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      targetId: 't-2',
      isPrimary: false,
      isEnabled: false,
      dnsRecords: null,
    },
  ];
};

vi.mock('@/pages/asset-group/components/asset-group-workflow', () => ({
  default: () => <div data-testid="mock-workflow" />,
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/services/apis/gen/queries')
  >();
  return {
    ...actual,
    useAssetGroupControllerGetById: () => ({
      data: mockGroup,
      refetch: vi.fn(),
      isLoading: false,
    }),
    useAssetGroupControllerDelete: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useAssetGroupControllerGetStatistic: () => ({
      data: mockStatistic,
      isLoading: false,
    }),
    useAssetGroupControllerGetAssetsByAssetGroupsId: () => ({
      data: {
        data: assetsRef.value,
        total: assetsRef.value.length,
        page: 1,
        limit: 10,
      },
      isLoading: false,
      refetch: vi.fn(),
    }),
    useAssetGroupControllerRemoveManyAssets: () => ({
      mutate: removeManyMock,
      isPending: false,
    }),
  };
});

beforeEach(() => {
  removeManyMock.mockReset();
  removeManyMock.mockImplementation(
    (
      _vars: unknown,
      opts?: { onSuccess?: (response: unknown) => void },
    ) => {
      opts?.onSuccess?.({});
    },
  );
  resetAssets();
});

describe('AssetGroupDetail page', () => {
  it('renders stat cards with severity breakdown from the group statistic', async () => {
    renderWithProviders(<AssetGroupDetail />, {
      routePath: '/groups/$id',
      initialEntries: ['/groups/group-1'],
    });

    expect(await screen.findByText('Vulnerabilities')).toBeInTheDocument();
    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByText('Ports')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();

    // Severity stacked bar + legend
    expect(screen.getByTestId('severity-bar')).toBeInTheDocument();
    expect(
      screen.getByTestId('severity-segment-criticalVuls'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('severity-segment-highVuls'),
    ).toBeInTheDocument();
    // Zero-count severity has no segment
    expect(
      screen.queryByTestId('severity-segment-lowVuls'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Critical 1')).toBeInTheDocument();
    expect(screen.getByText('High 2')).toBeInTheDocument();
  });

  it('lists hosts with status and IP count', async () => {
    renderWithProviders(<AssetGroupDetail />, {
      routePath: '/groups/$id',
      initialEntries: ['/groups/group-1'],
    });

    expect(await screen.findByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    // asset-1 has 2 A records + 1 AAAA record
    expect(screen.getByTestId('ips-asset-1')).toHaveTextContent('3');
    // asset-2 has no dnsRecords
    expect(screen.getByTestId('ips-asset-2')).toHaveTextContent('0');
  });

  it('shows the empty state when the group has no hosts', async () => {
    assetsRef.value = [];
    renderWithProviders(<AssetGroupDetail />, {
      routePath: '/groups/$id',
      initialEntries: ['/groups/group-1'],
    });

    expect(
      await screen.findByText('No hosts in this group yet'),
    ).toBeInTheDocument();
  });

  it('bulk removes selected hosts', async () => {
    const { user } = renderWithProviders(<AssetGroupDetail />, {
      routePath: '/groups/$id',
      initialEntries: ['/groups/group-1'],
    });
    await screen.findByText('https://example.com');

    await user.click(screen.getAllByLabelText('Select row')[0]);
    expect(await screen.findByText(/1 selected/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove selected' }));

    await waitFor(() => {
      expect(removeManyMock).toHaveBeenCalledWith(
        { groupId: 'group-1', data: { assetIds: ['asset-1'] } },
        expect.anything(),
      );
    });
  });

  it('navigates to the asset detail page when a row is clicked', async () => {
    const { user, router } = renderWithProviders(<AssetGroupDetail />, {
      routePath: '/groups/$id',
      initialEntries: ['/groups/group-1'],
    });
    await screen.findByText('https://example.com');

    await user.click(screen.getByText('https://example.com'));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/assets/asset-1');
    });
  });
});
