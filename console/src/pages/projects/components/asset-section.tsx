import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  getAssetGroupControllerGetAssetsByAssetGroupsIdQueryKey,
  getAssetGroupControllerGetAssetsNotInAssetGroupQueryKey,
  getAssetGroupControllerGetByIdQueryKey,
  useAssetGroupControllerGetAssetsByAssetGroupsId,
  useAssetGroupControllerRemoveManyAssets,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { TrashIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { SelectAssetsDialog } from './select-assets-dialog';

interface Asset {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  targetId?: string;
  target?: {
    id: string;
    value: string;
  };
}

interface AssetSectionProps {
  projectId: string;
  /** Count reported by the project itself; falls back to the table total. */
  totalAssets?: number;
}

export const AssetSection: React.FC<AssetSectionProps> = ({
  projectId,
  totalAssets,
}) => {
  const queryClient = useQueryClient();

  // Queries for assets in the project
  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setParams, setFilter },
  } = useServerDataTable();

  const assetsInProjectQuery = useAssetGroupControllerGetAssetsByAssetGroupsId(
    projectId,
    { page, limit: pageSize, sortBy, sortOrder, search: filter },
  );

  // Mutations
  const { mutate: removeAssets, isPending: removePending } =
    useAssetGroupControllerRemoveManyAssets();

  const handleRemoveAssets = useCallback(
    (assetIds: string[]) => {
      removeAssets(
        {
          groupId: projectId,
          data: { assetIds },
        },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({
              queryKey:
                getAssetGroupControllerGetAssetsByAssetGroupsIdQueryKey(
                  projectId,
                ),
            });
            void queryClient.invalidateQueries({
              queryKey: getAssetGroupControllerGetAssetsNotInAssetGroupQueryKey(
                projectId,
              ),
            });
            void queryClient.invalidateQueries({
              queryKey: getAssetGroupControllerGetByIdQueryKey(projectId),
              exact: true,
            });
          },
        },
      );
    },
    [projectId, removeAssets, queryClient],
  );

  // Asset table columns
  const assetColumns: ColumnDef<Asset>[] = useMemo(
    () => [
      {
        accessorKey: 'value',
        header: 'Host value',
      },
      {
        accessorKey: 'createdAt',
        header: 'Created at',
        cell: ({ row }) =>
          new Date(row.original.createdAt).toLocaleDateString(),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <ConfirmDialog
            title="Confirm Delete"
            description="Are you sure you want to remove this host from the project? This action cannot be undone."
            onConfirm={() => handleRemoveAssets([row.original.id])}
            confirmText="Remove"
            cancelText="Cancel"
            disabled={removePending}
            trigger={
              <Button variant="outline" size="sm" disabled={removePending}>
                <TrashIcon className="h-4 w-4" />
              </Button>
            }
          />
        ),
      },
    ],
    [handleRemoveAssets, removePending],
  );

  const hostCount = totalAssets ?? assetsInProjectQuery.data?.total ?? 0;

  return (
    <section className="flex flex-col gap-2 border-t pt-2">
      <div className="flex flex-row items-center justify-between gap-4 px-4 py-2 md:px-6">
        <div>
          <div className="leading-none font-semibold">Hosts</div>
          <div className="hidden text-sm text-muted-foreground md:block">
            {hostCount} host{hostCount === 1 ? '' : 's'} in this project
          </div>
        </div>
        <SelectAssetsDialog
          projectId={projectId}
          onAssetsAdded={() => assetsInProjectQuery.refetch()}
        />
      </div>
      <div className="px-4 py-2 md:px-6">
        <DataTable
          columns={assetColumns}
          data={assetsInProjectQuery.data?.data ?? []}
          isLoading={assetsInProjectQuery.isLoading}
          page={assetsInProjectQuery.data?.page ?? 1}
          pageSize={assetsInProjectQuery.data?.limit ?? 10}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSortChange={(col, order) => {
            setParams({ sortBy: col, sortOrder: order });
          }}
          filterColumnKey="value"
          filterValue={filter}
          onFilterChange={setFilter}
          totalItems={assetsInProjectQuery.data?.total ?? 0}
          emptyMessage="No hosts in this project yet"
        />
      </div>
    </section>
  );
};
