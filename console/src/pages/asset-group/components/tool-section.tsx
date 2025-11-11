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
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useAssetGroupControllerAddManyTools,
  useAssetGroupControllerRemoveManyTools,
  useAssetGroupControllerGetToolsByAssetGroupsId,
  useAssetGroupControllerGetToolsNotInAssetGroup,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';

interface Tool {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  isInstalled?: boolean;
}

interface ToolSectionProps {
  assetGroupId: string;
  refetch: () => void;
}

export const ToolSection: React.FC<ToolSectionProps> = ({
  assetGroupId,
  refetch,
}) => {
  const queryClient = useQueryClient();

  // Queries for tools in the asset group
  const toolsInGroupQuery = useAssetGroupControllerGetToolsByAssetGroupsId(
    assetGroupId,
    { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
  );

  // Add tools dialog state
  const [showAddToolsDialog, setShowAddToolsDialog] = useState(false);
  const [toolsToAdd, setToolsToAdd] = useState('');
  const [showSelectToolsDialog, setShowSelectToolsDialog] = useState(false);

  // Selected tools for adding to group
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  // Mutations
  const addToolsMutation = useAssetGroupControllerAddManyTools();
  const removeToolsMutation = useAssetGroupControllerRemoveManyTools();

  // Queries for tools not in asset group
  const toolsNotInGroupQuery = useAssetGroupControllerGetToolsNotInAssetGroup(
    assetGroupId,
    { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
    { query: { enabled: showSelectToolsDialog } },
  );

  const handleAddTools = () => {
    if (!toolsToAdd.trim()) return;

    const toolIds = toolsToAdd
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id);

    addToolsMutation.mutate(
      {
        groupId: assetGroupId,
        data: { toolIds },
      },
      {
        onSuccess: () => {
          refetch();
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetToolsByAssetGroupsId'],
          });
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetToolsNotInAssetGroup'],
          });
          setToolsToAdd('');
          setShowAddToolsDialog(false);
        },
      },
    );
  };

  const handleRemoveTools = (toolIds: string[]) => {
    removeToolsMutation.mutate(
      {
        groupId: assetGroupId,
        data: { toolIds },
      },
      {
        onSuccess: () => {
          refetch();
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetToolsByAssetGroupsId'],
          });
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetToolsNotInAssetGroup'],
          });
        },
      },
    );
  };

  // Handle adding selected tools to the group
  const handleAddSelectedTools = () => {
    if (selectedTools.length === 0) return;

    addToolsMutation.mutate(
      {
        groupId: assetGroupId,
        data: { toolIds: selectedTools },
      },
      {
        onSuccess: () => {
          refetch();
          setSelectedTools([]);
          setShowSelectToolsDialog(false);
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetToolsByAssetGroupsId'],
          });
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetToolsNotInAssetGroup'],
          });
        },
      },
    );
  };

  // Tool table columns
  const toolColumns: ColumnDef<Tool>[] = [
    {
      accessorKey: 'name',
      header: 'Tool Name',
    },
    {
      accessorKey: 'description',
      header: 'Description',
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
          onClick={() => handleRemoveTools([row.original.id])}
          disabled={removeToolsMutation.isPending}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  // Columns for tools not in group with selection
  const toolsNotInGroupColumns: ColumnDef<Tool>[] = [
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
            const toolId = row.original.id;
            setSelectedTools((prev) =>
              value ? [...prev, toolId] : prev.filter((id) => id !== toolId),
            );
          }}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: 'Tool Name',
    },
    {
      accessorKey: 'description',
      header: 'Description',
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
          <CardTitle>Tools</CardTitle>
          <CardDescription>
            {toolsInGroupQuery.data?.total || 0} tools in this group
          </CardDescription>
        </div>
        <div className="flex space-x-2">
          <Dialog
            open={showSelectToolsDialog}
            onOpenChange={setShowSelectToolsDialog}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <PlusIcon className="h-4 w-4 mr-2" />
                Add More Tools
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Select Tools to Add</DialogTitle>
                <DialogDescription>
                  Choose tools not currently in this asset group to add (must be
                  preinstalled in workspace)
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <DataTable
                  columns={toolsNotInGroupColumns}
                  data={toolsNotInGroupQuery.data?.data || []}
                  isLoading={toolsNotInGroupQuery.isLoading}
                  page={toolsNotInGroupQuery.data?.page || 1}
                  pageSize={toolsNotInGroupQuery.data?.limit || 10}
                  totalItems={toolsNotInGroupQuery.data?.total || 0}
                  onPageChange={() => {}}
                />
              </div>
              <DialogFooter className="flex sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  {selectedTools.length} of{' '}
                  {toolsNotInGroupQuery.data?.data?.length || 0} selected
                </div>
                <Button
                  type="submit"
                  onClick={handleAddSelectedTools}
                  disabled={
                    selectedTools.length === 0 || addToolsMutation.isPending
                  }
                >
                  {addToolsMutation.isPending
                    ? 'Adding...'
                    : `Add ${selectedTools.length} Tools`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {toolsInGroupQuery.data && toolsInGroupQuery.data.data.length > 0 ? (
          <DataTable
            columns={toolColumns}
            data={toolsInGroupQuery.data.data}
            isLoading={toolsInGroupQuery.isLoading}
            page={toolsInGroupQuery.data.page}
            pageSize={toolsInGroupQuery.data.limit}
            totalItems={toolsInGroupQuery.data.total}
            onPageChange={() => {}}
          />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No tools in this group
          </div>
        )}
      </CardContent>
    </Card>
  );
};
