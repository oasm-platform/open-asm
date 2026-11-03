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
  getAssetGroupControllerGetAssetsByAssetGroupsIdQueryKey,
  getAssetGroupControllerGetAssetsNotInAssetGroupQueryKey,
  useAssetGroupControllerAddManyAssets,
  useAssetGroupControllerGetAssetsNotInAssetGroup,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

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
  projectId: string;
  trigger?: React.ReactNode;
  onAssetsAdded?: () => void;
}

const defaultTrigger = (
  <Button variant="outline">
    <PlusIcon className="h-4 w-4" />
    Add
  </Button>
);

export const SelectAssetsDialog: React.FC<SelectAssetsDialogProps> = ({
  projectId,
  trigger,
  onAssetsAdded,
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Selected assets for adding to the project
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>('');

  // Mutations
  const addAssetsMutation = useAssetGroupControllerAddManyAssets();
  const addAsset = addAssetsMutation.mutate;

  // Queries for assets not in the project
  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
    tableHandlers: { setPage, setPageSize, setParams },
  } = useServerDataTable({
    isUpdateSearchQueryParam: false,
    defaultPageSize: 10,
  });

  const assetsNotInProjectQuery = useAssetGroupControllerGetAssetsNotInAssetGroup(
    projectId,
    { page, limit: pageSize, sortBy, sortOrder, search: filter },
    { query: { enabled: open } },
  );

  // Handle adding selected assets to the project
  const handleAddSelectedAssets = useCallback(() => {
    if (selectedAssets.size === 0) return;

    addAsset(
      {
        groupId: projectId,
        data: { assetIds: Array.from(selectedAssets) },
      },
      {
        onSuccess: () => {
          setSelectedAssets(new Set());
          setOpen(false);
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
          onAssetsAdded?.();
        },
      },
    );
  }, [selectedAssets, addAsset, projectId, queryClient, onAssetsAdded]);

  // Columns for assets not in the project, with selection
  const assetsNotInProjectColumns: ColumnDef<Asset>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () => {
          // Calculate if all page rows are selected based on our selectedAssets state
          const allIds =
            assetsNotInProjectQuery.data?.data?.map((asset) => asset.id) || [];
          const allPageRowsSelected =
            allIds.length > 0 && allIds.every((id) => selectedAssets.has(id));
          const somePageRowsSelected = allIds.some((id) =>
            selectedAssets.has(id),
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
                    assetsNotInProjectQuery.data?.data?.map(
                      (asset) => asset.id,
                    ) || [];
                  setSelectedAssets((prev) => new Set([...prev, ...allIds]));
                } else {
                  // When deselecting all, remove all visible assets from selection
                  const allIds =
                    assetsNotInProjectQuery.data?.data?.map(
                      (asset) => asset.id,
                    ) || [];
                  setSelectedAssets((prev) => {
                    const newSet = new Set(prev);
                    allIds.forEach((id) => newSet.delete(id));
                    return newSet;
                  });
                }
              }}
              aria-label="Select all"
            />
          );
        },
        cell: ({ row }) => {
          const assetId = row.original.id;
          const isSelected = selectedAssets.has(assetId);

          return (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(value) => {
                setSelectedAssets((prev) => {
                  const newSet = new Set(prev);
                  if (value) {
                    newSet.add(assetId);
                  } else {
                    newSet.delete(assetId);
                  }
                  return newSet;
                });
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
        header: 'Host Value',
      },
      {
        accessorKey: 'createdAt',
        header: 'Created At',
        cell: ({ row }) =>
          new Date(row.original.createdAt).toLocaleDateString(),
      },
    ],
    [selectedAssets, assetsNotInProjectQuery.data],
  );

  const handleRowClick = useCallback(
    (row: Asset) => {
      const assetId = (row as Asset).id;
      const isSelected = selectedAssets.has(assetId);
      setSelectedAssets((prev) => {
        const newSet = new Set(prev);
        if (isSelected) {
          newSet.delete(assetId);
        } else {
          newSet.add(assetId);
        }
        return newSet;
      });
    },
    [selectedAssets],
  );

  const tableState = useMemo(
    () => ({
      rowSelection: Object.fromEntries(
        Array.from(selectedAssets).map((id) => [id, true]),
      ),
    }),
    [selectedAssets],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Select hosts to add</DialogTitle>
          <DialogDescription>
            Choose hosts not currently in this project to add
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <DataTable
            columns={assetsNotInProjectColumns}
            data={assetsNotInProjectQuery.data?.data || []}
            isLoading={assetsNotInProjectQuery.isLoading}
            page={assetsNotInProjectQuery.data?.page || 1}
            pageSize={assetsNotInProjectQuery.data?.limit || 10}
            sortBy={sortBy}
            sortOrder={sortOrder}
            filterValue={filter}
            onFilterChange={setFilter}
            filterColumnKey="value"
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onSortChange={(col, order) => {
              setParams({ sortBy: col, sortOrder: order });
            }}
            totalItems={assetsNotInProjectQuery.data?.total || 0}
            onRowClick={handleRowClick}
            tableState={tableState}
          />
        </div>
        <DialogFooter className="flex sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedAssets.size} of {assetsNotInProjectQuery.data?.total || 0}{' '}
            selected
          </div>
          <Button
            type="submit"
            onClick={handleAddSelectedAssets}
            disabled={selectedAssets.size === 0 || addAssetsMutation.isPending}
          >
            {addAssetsMutation.isPending
              ? 'Adding...'
              : `Add ${selectedAssets.size} Hosts`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
