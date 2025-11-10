import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useAssetGroupControllerGetById,
  useAssetGroupControllerAddManyTools,
  useAssetGroupControllerAddManyAssets,
  useAssetGroupControllerRemoveManyAssets,
  useAssetGroupControllerRemoveManyTools,
} from '@/services/apis/gen/queries';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

interface Asset {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

interface Tool {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export default function AssetGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch } = useAssetGroupControllerGetById(id!);

  // Add assets dialog state
  const [showAddAssetsDialog, setShowAddAssetsDialog] = useState(false);
  const [assetsToAdd, setAssetsToAdd] = useState('');

  // Add tools dialog state
  const [showAddToolsDialog, setShowAddToolsDialog] = useState(false);
  const [toolsToAdd, setToolsToAdd] = useState('');

  // Mutations
  const addAssetsMutation = useAssetGroupControllerAddManyAssets();
  const removeAssetsMutation = useAssetGroupControllerRemoveManyAssets();
  const addToolsMutation = useAssetGroupControllerAddManyTools();
  const removeToolsMutation = useAssetGroupControllerRemoveManyTools();

  if (!data) return <div>Loading...</div>;

  const handleAddAssets = () => {
    if (!assetsToAdd.trim()) return;

    const assetIds = assetsToAdd
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id);

    addAssetsMutation.mutate(
      {
        groupId: id!,
        data: { assetIds },
      },
      {
        onSuccess: () => {
          refetch();
          setAssetsToAdd('');
          setShowAddAssetsDialog(false);
        },
      },
    );
  };

  const handleRemoveAssets = (assetIds: string[]) => {
    removeAssetsMutation.mutate(
      {
        groupId: id!,
        data: { assetIds },
      },
      {
        onSuccess: () => {
          refetch();
        },
      },
    );
  };

  const handleAddTools = () => {
    if (!toolsToAdd.trim()) return;

    const toolIds = toolsToAdd
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id);

    addToolsMutation.mutate(
      {
        groupId: id!,
        data: { toolIds },
      },
      {
        onSuccess: () => {
          refetch();
          setToolsToAdd('');
          setShowAddToolsDialog(false);
        },
      },
    );
  };

  const handleRemoveTools = (toolIds: string[]) => {
    removeToolsMutation.mutate(
      {
        groupId: id!,
        data: { toolIds },
      },
      {
        onSuccess: () => {
          refetch();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{data.name}</h1>
        <p className="text-muted-foreground">
          Asset Group ID: {data.id} | Created:{' '}
          {new Date(data.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Assets</CardTitle>
              <CardDescription>
                {data.assets?.length || 0} assets in this group
              </CardDescription>
            </div>
            <Dialog
              open={showAddAssetsDialog}
              onOpenChange={setShowAddAssetsDialog}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Assets
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Assets to Group</DialogTitle>
                  <DialogDescription>
                    Enter comma-separated asset IDs to add to this asset group
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center space-x-2">
                  <div className="grid flex-1 gap-2">
                    <Input
                      id="asset-ids"
                      placeholder="e.g., asset1, asset2, asset3"
                      value={assetsToAdd}
                      onChange={(e) => setAssetsToAdd(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    onClick={handleAddAssets}
                    disabled={addAssetsMutation.isPending}
                  >
                    {addAssetsMutation.isPending ? 'Adding...' : 'Add Assets'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {data.assets && data.assets.length > 0 ? (
              <DataTable
                columns={assetColumns}
                data={data.assets}
                isLoading={isLoading}
                page={1}
                pageSize={10}
                totalItems={data.assets.length}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No assets in this group
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tools Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Tools</CardTitle>
              <CardDescription>
                {data.tools?.length || 0} tools in this group
              </CardDescription>
            </div>
            <Dialog
              open={showAddToolsDialog}
              onOpenChange={setShowAddToolsDialog}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Tools
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Tools to Group</DialogTitle>
                  <DialogDescription>
                    Enter comma-separated tool IDs to add to this asset group
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center space-x-2">
                  <div className="grid flex-1 gap-2">
                    <Input
                      id="tool-ids"
                      placeholder="e.g., tool1, tool2, tool3"
                      value={toolsToAdd}
                      onChange={(e) => setToolsToAdd(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    onClick={handleAddTools}
                    disabled={addToolsMutation.isPending}
                  >
                    {addToolsMutation.isPending ? 'Adding...' : 'Add Tools'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {data.tools && data.tools.length > 0 ? (
              <DataTable
                columns={toolColumns}
                data={data.tools}
                isLoading={isLoading}
                page={1}
                pageSize={10}
                totalItems={data.tools.length}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No tools in this group
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
