import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useAssetGroupControllerAddManyAssets,
  useAssetGroupControllerRemoveManyAssets,
  useAssetGroupControllerGetAssetsByAssetGroupsId,
  useAssetGroupControllerGetAssetsNotInAssetGroup,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';

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
  const assetsInGroupQuery = useAssetGroupControllerGetAssetsByAssetGroupsId(
    assetGroupId,
    { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
  );

  const [showSelectAssetsDialog, setShowSelectAssetsDialog] = useState(false);

  // Selected assets for adding to group
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);

  // Mutations
  const addAssetsMutation = useAssetGroupControllerAddManyAssets();
  const removeAssetsMutation = useAssetGroupControllerRemoveManyAssets();

  // Queries for assets not in asset group
  const assetsNotInGroupQuery = useAssetGroupControllerGetAssetsNotInAssetGroup(
    assetGroupId,
    { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
    { query: { enabled: showSelectAssetsDialog } },
  );

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

  // Handle adding selected assets to the group
  const handleAddSelectedAssets = () => {
    if (selectedAssets.length === 0) return;

    addAssetsMutation.mutate(
      {
        groupId: assetGroupId,
        data: { assetIds: selectedAssets },
      },
      {
        onSuccess: () => {
          assetsInGroupQuery.refetch();
          setSelectedAssets([]);
          setShowSelectAssetsDialog(false);
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
      header: 'Asset Value',
    },
    {
      accessorKey: 'createdAt',
      header: 'Created At',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => handleRemoveAssets([row.original.id])}
          disabled={removeAssetsMutation.isPending}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  // Columns for assets not in group with selection
  const assetsNotInGroupColumns: ColumnDef<Asset>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => {
            row.toggleSelected(!!value);
            const assetId = row.original.id;
            setSelectedAssets((prev) =>
              value ? [...prev, assetId] : prev.filter((id) => id !== assetId),
            );
          }}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'value',
      header: 'Asset Value',
    },
    {
      accessorKey: 'createdAt',
      header: 'Created At',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Assets</CardTitle>
          <CardDescription>
            {assetsInGroupQuery.data?.total || 0} assets in this group
          </CardDescription>
        </div>
        <div className="flex space-x-2">
          <Dialog
            open={showSelectAssetsDialog}
            onOpenChange={setShowSelectAssetsDialog}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <PlusIcon className="h-4 w-4 mr-2" />
                Add More Assets
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Select Assets to Add</DialogTitle>
                <DialogDescription>
                  Choose assets not currently in this asset group to add
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <DataTable
                  columns={assetsNotInGroupColumns}
                  data={assetsNotInGroupQuery.data?.data || []}
                  isLoading={assetsNotInGroupQuery.isLoading}
                  page={assetsNotInGroupQuery.data?.page || 1}
                  pageSize={assetsNotInGroupQuery.data?.limit || 10}
                  totalItems={assetsNotInGroupQuery.data?.total || 0}
                  onPageChange={() => {}}
                />
              </div>
              <DialogFooter className="flex sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  {selectedAssets.length} of{' '}
                  {assetsNotInGroupQuery.data?.data?.length || 0} selected
                </div>
                <Button
                  type="submit"
                  onClick={handleAddSelectedAssets}
                  disabled={
                    selectedAssets.length === 0 || addAssetsMutation.isPending
                  }
                >
                  {addAssetsMutation.isPending
                    ? 'Adding...'
                    : `Add ${selectedAssets.length} Assets`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {assetsInGroupQuery.data && assetsInGroupQuery.data.data.length > 0 ? (
          <DataTable
            columns={assetColumns}
            data={assetsInGroupQuery.data.data}
            isLoading={assetsInGroupQuery.isLoading}
            page={assetsInGroupQuery.data.page}
            pageSize={assetsInGroupQuery.data.limit}
            totalItems={assetsInGroupQuery.data.total}
            onPageChange={() => {}}
          />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No assets in this group
          </div>
        )}
      </CardContent>
    </Card>
  );
};
