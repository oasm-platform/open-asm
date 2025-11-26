import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  useAssetGroupControllerAddManyWorkflows,
  useAssetGroupControllerGetWorkflowsByAssetGroupsId,
  useAssetGroupControllerGetWorkflowsNotInAssetGroup,
  useAssetGroupControllerRemoveManyWorkflows,
  type Workflow,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';

interface WorkflowSectionProps {
  assetGroupId: string;
}

export const WorkflowSection: React.FC<WorkflowSectionProps> = ({
  assetGroupId,
}) => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [page2, setPage2] = useState(1);

  // Queries for workflows in the asset group
  const workflowsInGroupQuery =
    useAssetGroupControllerGetWorkflowsByAssetGroupsId(assetGroupId, {
      page: page,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });

  const [showSelectWorkflowsDialog, setShowSelectWorkflowsDialog] =
    useState(false);

  // Selected workflows for adding to group
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);

  // Mutations
  const addWorkflowsMutation = useAssetGroupControllerAddManyWorkflows();
  const removeWorkflowsMutation = useAssetGroupControllerRemoveManyWorkflows();

  // Queries for workflows not in asset group
  const workflowsNotInGroupQuery =
    useAssetGroupControllerGetWorkflowsNotInAssetGroup(
      assetGroupId,
      { page: page2, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
      { query: { enabled: showSelectWorkflowsDialog } },
    );

  const handleRemoveWorkflows = (workflowIds: string[]) => {
    removeWorkflowsMutation.mutate(
      {
        groupId: assetGroupId,
        data: { workflowIds },
      },
      {
        onSuccess: () => {
          workflowsInGroupQuery.refetch();
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetWorkflowsByAssetGroupsId'],
          });
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetWorkflowsNotInAssetGroup'],
          });
        },
      },
    );
  };

  // Handle adding selected workflows to the group
  const handleAddSelectedWorkflows = () => {
    if (selectedWorkflows.length === 0) return;

    addWorkflowsMutation.mutate(
      {
        groupId: assetGroupId,
        data: { workflowIds: selectedWorkflows },
      },
      {
        onSuccess: () => {
          workflowsInGroupQuery.refetch();
          setSelectedWorkflows([]);
          setShowSelectWorkflowsDialog(false);
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetWorkflowsByAssetGroupsId'],
          });
          queryClient.invalidateQueries({
            queryKey: ['assetGroupControllerGetWorkflowsNotInAssetGroup'],
          });
        },
      },
    );
  };

  // Workflow table columns
  const workflowColumns: ColumnDef<Workflow, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Workflow Name',
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
      accessorFn: () => undefined,
      header: 'Actions',
      cell: ({ row }) => (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => handleRemoveWorkflows([row.original.id])}
          disabled={removeWorkflowsMutation.isPending}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  // Columns for workflows not in group with selection
  const workflowsNotInGroupColumns: ColumnDef<Workflow, unknown>[] = [
    {
      id: 'select',
      accessorFn: () => undefined,
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
            const workflowId = row.original.id;
            setSelectedWorkflows((prev) =>
              value
                ? [...prev, workflowId]
                : prev.filter((id) => id !== workflowId),
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
      header: 'Workflow Name',
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
            {workflowsInGroupQuery.data?.total || 0} workflows in this group
          </CardDescription>
        </div>
        <div className="flex space-x-2">
          <Dialog
            open={showSelectWorkflowsDialog}
            onOpenChange={setShowSelectWorkflowsDialog}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <PlusIcon className="h-4 w-4 mr-2" />
                Add More Workflows
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Select Workflows to Add</DialogTitle>
                <DialogDescription>
                  Choose workflows not currently in this asset group to add
                  (must be preinstalled in workspace)
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <DataTable
                  columns={workflowsNotInGroupColumns}
                  data={workflowsNotInGroupQuery.data?.data || []}
                  isLoading={workflowsNotInGroupQuery.isLoading}
                  page={workflowsNotInGroupQuery.data?.page || 1}
                  pageSize={workflowsNotInGroupQuery.data?.limit || 10}
                  totalItems={workflowsNotInGroupQuery.data?.total || 0}
                  onPageChange={setPage2}
                />
              </div>
              <DialogFooter className="flex sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  {selectedWorkflows.length} of{' '}
                  {workflowsNotInGroupQuery.data?.data?.length || 0} selected
                </div>
                <Button
                  type="submit"
                  onClick={handleAddSelectedWorkflows}
                  disabled={
                    selectedWorkflows.length === 0 ||
                    addWorkflowsMutation.isPending
                  }
                >
                  {addWorkflowsMutation.isPending
                    ? 'Adding...'
                    : `Add ${selectedWorkflows.length} Workflows`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {workflowsInGroupQuery.data &&
          workflowsInGroupQuery.data.data.length > 0 ? (
          <DataTable
            columns={workflowColumns}
            data={workflowsInGroupQuery.data.data}
            isLoading={workflowsInGroupQuery.isLoading}
            page={workflowsInGroupQuery.data.page}
            pageSize={workflowsInGroupQuery.data.limit}
            totalItems={workflowsInGroupQuery.data.total}
            onPageChange={setPage}
          />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No workflows in this group
          </div>
        )}
      </CardContent>
    </Card>
  );
};
