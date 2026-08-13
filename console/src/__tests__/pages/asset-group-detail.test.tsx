import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { within } from '@testing-library/react';
import AssetGroupDetail from '@/pages/asset-group/asset-group-detail';

const mockGroup = {
  id: 'group-1',
  name: 'Web Servers',
  hexColor: '#3b82f6',
  assetGroupWorkflows: [],
};

const { removeManyMock, assetsRef } = vi.hoisted(() => {
  const baseAssets = [
    {
      id: 'asset-1',
      value: 'https://example.com',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
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
  it('lists hosts with value and created date', async () => {
    renderWithProviders(<AssetGroupDetail />, {
      routePath: '/groups/$id',
      initialEntries: ['/groups/group-1'],
    });

    expect(await screen.findByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('https://api.example.com')).toBeInTheDocument();
    expect(screen.getByText('Host value')).toBeInTheDocument();
    expect(screen.getByText('Created at')).toBeInTheDocument();
    expect(
      screen.getByText(new Date('2026-01-01T00:00:00Z').toLocaleDateString()),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new Date('2026-01-02T00:00:00Z').toLocaleDateString()),
    ).toBeInTheDocument();
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

  it('removes a single host through the row action', async () => {
    const { user } = renderWithProviders(<AssetGroupDetail />, {
      routePath: '/groups/$id',
      initialEntries: ['/groups/group-1'],
    });
    await screen.findByText('https://example.com');

    // The action button lives in the first data row (row 0 is the header).
    const firstRow = screen.getAllByRole('row')[1];
    await user.click(within(firstRow).getByRole('button'));

    await user.click(
      await screen.findByRole('button', { name: 'Remove' }),
    );

    await waitFor(() => {
      expect(removeManyMock).toHaveBeenCalledWith(
        { groupId: 'group-1', data: { assetIds: ['asset-1'] } },
        expect.anything(),
      );
    });
  });
});
