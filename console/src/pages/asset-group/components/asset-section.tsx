import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useAssetGroupControllerGetAssetsByAssetGroupsId,
  useAssetGroupControllerRemoveManyAssets,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { TrashIcon } from 'lucide-react';
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
  assetGroupId: string;
}

export const AssetSection: React.FC<AssetSectionProps> = ({ assetGroupId }) => {
  const queryClient = useQueryClient();

  // Queries for assets in the asset group
  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
  } = useServerDataTable();

  const assetsInGroupQuery = useAssetGroupControllerGetAssetsByAssetGroupsId(
    assetGroupId,
    { page, limit: pageSize, sortBy, sortOrder },
  );

  // Mutations
  const removeAssetsMutation = useAssetGroupControllerRemoveManyAssets();

  const handleRemoveAssets = (assetIds: string[]) => {
    removeAssetsMutation.mutate(
      {
        groupId: assetGroupId,
        data: { assetIds },
      },
      {
        onSuccess: () => {
          assetsInGroupQuery.refetch();
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetAssetsByAssetGroupsId'],
          });
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetAssetsNotInAssetGroup'],
          });
        },
      },
    );
  };

  // Asset table columns
  const assetColumns: ColumnDef<Asset>[] = [
    {
      accessorKey: 'value',
      header: 'Asset value',
    },
    {
      accessorKey: 'createdAt',
      header: 'Created at',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <ConfirmDialog
          title="Confirm Delete"
          description="Are you sure you want to remove this asset from the group? This action cannot be undone."
          onConfirm={() => handleRemoveAssets([row.original.id])}
          confirmText="Remove"
          cancelText="Cancel"
          disabled={removeAssetsMutation.isPending}
          trigger={
            <Button
              variant="outline"
              size="sm"
              disabled={removeAssetsMutation.isPending}
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-row items-center justify-between space-y-0 pb-2 mb-4">
        <div>
          <h2 className="text-xl font-semibold">Assets</h2>
          <p className="text-sm text-muted-foreground">
            {assetsInGroupQuery.data?.total || 0} assets in this group
          </p>
        </div>
        <div className="flex space-x-2">
          <SelectAssetsDialog
            assetGroupId={assetGroupId}
            onAssetsAdded={() => assetsInGroupQuery.refetch()}
          />
        </div>
      </div>
      <DataTable
        columns={assetColumns}
        data={assetsInGroupQuery.data?.data ?? []}
        isLoading={assetsInGroupQuery.isLoading}
        page={assetsInGroupQuery.data?.page ?? 1}
        pageSize={assetsInGroupQuery.data?.limit ?? 10}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        totalItems={assetsInGroupQuery.data?.total ?? 0}
      />
    </div>
  );
};
