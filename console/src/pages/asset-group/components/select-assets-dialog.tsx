import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useAssetGroupControllerAddManyAssets,
  useAssetGroupControllerGetAssetsNotInAssetGroup,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

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

interface SelectAssetsDialogProps {
  assetGroupId: string;
  trigger?: React.ReactNode;
  onAssetsAdded?: () => void;
}

export const SelectAssetsDialog: React.FC<SelectAssetsDialogProps> = ({
  assetGroupId,
  trigger,
  onAssetsAdded,
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Selected assets for adding to group
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);

  // Mutations
  const addAssetsMutation = useAssetGroupControllerAddManyAssets();

  // Queries for assets not in asset group
  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
  } = useServerDataTable({
    isUpdateSearchQueryParam: false,
    defaultPageSize: 10,
  });

  const assetsNotInGroupQuery = useAssetGroupControllerGetAssetsNotInAssetGroup(
    assetGroupId,
    { page, limit: pageSize, sortBy, sortOrder },
    { query: { enabled: open } },
  );

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
          setSelectedAssets([]);
          setOpen(false);
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetAssetsByAssetGroupsId'],
          });
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetAssetsNotInAssetGroup'],
          });
          onAssetsAdded?.();
        },
      },
    );
  };

  // Reset table selection state when page changes to avoid incorrect "Select all" state
  useEffect(() => {
    // When page changes, we should reset the selection state of the table
    // to avoid the "Select all" checkbox showing incorrect state
  }, [page, pageSize, sortBy, sortOrder]);

  // Columns for assets not in group with selection
  const assetsNotInGroupColumns: ColumnDef<Asset>[] = [
    {
      id: 'select',
      header: ({ table }) => {
        // Calculate if all page rows are selected based on our selectedAssets state
        const allIds =
          assetsNotInGroupQuery.data?.data?.map((asset) => asset.id) || [];
        const allPageRowsSelected =
          allIds.length > 0 &&
          allIds.every((id) => selectedAssets.includes(id));
        const somePageRowsSelected = allIds.some((id) =>
          selectedAssets.includes(id),
        );

        return (
          <Checkbox
            checked={
              allPageRowsSelected || (somePageRowsSelected && 'indeterminate')
            }
            onCheckedChange={(value) => {
              if (value) {
                // When selecting all, add all visible assets that aren't already selected
                const allIds =
                  assetsNotInGroupQuery.data?.data?.map((asset) => asset.id) ||
                  [];
                setSelectedAssets((prev) => [...new Set([...prev, ...allIds])]); // Use Set to avoid duplicates
                table.toggleAllPageRowsSelected(true);
              } else {
                // When deselecting all, remove all visible assets from selection
                const allIds =
                  assetsNotInGroupQuery.data?.data?.map((asset) => asset.id) ||
                  [];
                setSelectedAssets((prev) =>
                  prev.filter((id) => !allIds.includes(id)),
                );
                table.toggleAllPageRowsSelected(false);
              }
            }}
            aria-label="Select all"
          />
        );
      },
      cell: ({ row }) => {
        const assetId = row.original.id;
        const isSelected = selectedAssets.includes(assetId);

        return (
          <Checkbox
            checked={isSelected}
            onCheckedChange={(value) => {
              setSelectedAssets((prev) =>
                value
                  ? [...prev, assetId]
                  : prev.filter((id) => id !== assetId),
              );
            }}
            aria-label="Select row"
          />
        );
      },
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

  const defaultTrigger = (
    <Button variant="outline">
      <PlusIcon className="h-4 w-4" />
      Add
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Select assets to add</DialogTitle>
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
            sortBy={sortBy}
            sortOrder={sortOrder}
            onPageChange={(newPage) => {
              // When page changes, we should ensure the table selection is handled properly
              setPage(newPage);
            }}
            onPageSizeChange={setPageSize}
            onSortChange={(col, order) => {
              setSortBy(col);
              setSortOrder(order);
            }}
            totalItems={assetsNotInGroupQuery.data?.total || 0}
            onRowClick={(row) => {
              const assetId = (row as Asset).id;
              const isSelected = selectedAssets.includes(assetId);
              setSelectedAssets((prev) =>
                isSelected
                  ? prev.filter((id) => id !== assetId)
                  : [...prev, assetId],
              );
            }}
            tableState={{
              rowSelection: selectedAssets.reduce(
                (acc, id) => {
                  acc[id] = true;
                  return acc;
                },
                {} as Record<string, boolean>,
              ),
            }}
          />
        </div>
        <DialogFooter className="flex sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedAssets.length} of {assetsNotInGroupQuery.data?.total || 0}{' '}
            selected
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
  );
};
