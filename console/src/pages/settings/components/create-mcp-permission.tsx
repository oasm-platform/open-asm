'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import {
  useMcpControllerCreateMcpPermission,
  useMcpControllerGetMcpTools,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Box, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

type FormData = {
  name: string;
  description: string;
};

// Define the structure for selected permissions
type PermissionSelection = {
  workspaceId: string;
  permissions: string[]; // Array of tool IDs or names that are selected
};

const CreateMcpPermission = () => {
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMcpControllerCreateMcpPermission();
  const { data: tools } = useMcpControllerGetMcpTools();
  const { refetch, workspaces } = useWorkspaceSelector();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>();

  // State to store selected permissions for each workspace
  const [selectedPermissions, setSelectedPermissions] = useState<
    PermissionSelection[]
  >([]);

  // Function to handle workspace checkbox change
  // According to requirements, workspace is selected when at least one tool is selected
  // When unchecking workspace, all child tools should also be unchecked
  const handleWorkspaceChange = (workspaceId: string) => {
    // Check if workspace is already in selectedPermissions
    const workspaceIndex = selectedPermissions.findIndex(
      (item) => item.workspaceId === workspaceId,
    );
    let newSelectedPermissions: PermissionSelection[];

    if (workspaceIndex > -1) {
      // If workspace is already selected, remove it (uncheck all tools)
      newSelectedPermissions = selectedPermissions.filter(
        (item) => item.workspaceId !== workspaceId,
      );
    } else {
      // If workspace is not selected, add it with all available tools selected
      // This implements the requirement: "workspace checked depends on just 1 item in tools checked"
      const workspaceTools = tools || [];
      const allToolIds = workspaceTools.map((tool) => tool.name);
      newSelectedPermissions = [
        ...selectedPermissions,
        { workspaceId, permissions: allToolIds },
      ];
    }

    setSelectedPermissions(newSelectedPermissions);
  };

  // Function to handle tool checkbox change for a specific workspace
  const handleToolChange = (workspaceId: string, toolId: string) => {
    const workspaceIndex = selectedPermissions.findIndex(
      (item) => item.workspaceId === workspaceId,
    );
    let newSelectedPermissions: PermissionSelection[];

    if (workspaceIndex > -1) {
      // Workspace exists in selectedPermissions
      const workspace = selectedPermissions[workspaceIndex];
      const toolIndex = workspace.permissions.indexOf(toolId);
      const newPermissions = [...workspace.permissions];

      if (toolIndex > -1) {
        // Remove tool from permissions
        newPermissions.splice(toolIndex, 1);
      } else {
        // Add tool to permissions
        newPermissions.push(toolId);
      }

      // Update the workspace with new permissions
      newSelectedPermissions = [...selectedPermissions];
      newSelectedPermissions[workspaceIndex] = {
        ...workspace,
        permissions: newPermissions,
      };
    } else {
      // Workspace not in selectedPermissions, add it with the tool
      newSelectedPermissions = [
        ...selectedPermissions,
        { workspaceId, permissions: [toolId] },
      ];
    }

    setSelectedPermissions(newSelectedPermissions);
  };

  // Function to check if a workspace is selected
  // According to the new requirements, a workspace is considered selected
  // when at least one tool is selected for that workspace
  const isWorkspaceSelected = (workspaceId: string) => {
    const workspace = selectedPermissions.find(
      (item) => item.workspaceId === workspaceId,
    );
    if (!workspace || workspace.permissions.length === 0) return false;

    const totalTools = tools?.length || 0;
    if (workspace.permissions.length < totalTools) {
      return 'indeterminate';
    }
    return true;
  };

  // Function to check if a tool is selected for a specific workspace
  const isToolSelected = (workspaceId: string, toolId: string) => {
    const workspace = selectedPermissions.find(
      (item) => item.workspaceId === workspaceId,
    );
    return workspace ? workspace.permissions.includes(toolId) : false;
  };

  const onSubmit = (data: FormData) => {
    // Check if at least one workspace has selected permissions
    if (
      selectedPermissions.length === 0 ||
      selectedPermissions.every(
        (permission) => permission.permissions.length === 0,
      )
    ) {
      toast.error(
        'At least one workspace must be selected with at least one tool',
      );
      return;
    }
    // Create workspace first, then assign permissions
    mutate(
      {
        data: {
          value: selectedPermissions,
          name: data.name,
          description: data.description,
        },
      },
      {
        onSuccess: () => {
          toast.success('MCP Permission created successfully');
          // Invalidate and refetch MCP permissions query to update the list
          queryClient.invalidateQueries({ queryKey: ['mcp-permissions'] });
          refetch();
          setOpen(false);
          reset();
          setSelectedPermissions([]);
        },
        onError: () => {
          toast.error('Failed to create MCP Permission');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Create new permission</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col flex-1 overflow-hidden"
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  {...register('name', { required: 'Name is required' })}
                  placeholder="Enter permission name"
                />
                {errors.name && (
                  <p className="text-red-600 text-sm">{errors.name.message}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={3}
                  {...register('description', { required: false })}
                  placeholder="Enter permission description"
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label>Workspaces & Tools</Label>
              <div className="space-y-4">
                {workspaces.map((workspace) => (
                  <div key={workspace.id} className="rounded-lg border bg-card">
                    <div className="flex items-center justify-between p-4 bg-muted/30">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {workspace.name}
                        </span>
                      </div>
                      <Checkbox
                        id={`workspace-${workspace.id}`}
                        checked={isWorkspaceSelected(workspace.id)}
                        onCheckedChange={() =>
                          handleWorkspaceChange(workspace.id)
                        }
                      />
                    </div>

                    {/* Tools list - only show if workspace is selected */}
                    {isWorkspaceSelected(workspace.id) && tools && (
                      <div className="p-4 border-t space-y-3 bg-white dark:bg-zinc-950">
                        {tools.map((tool) => (
                          <div
                            key={tool.name}
                            className="flex items-start justify-between group"
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-1 p-1 rounded-md bg-primary/10 text-primary">
                                <Box className="w-4 h-4" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {tool.name}
                                </span>
                                <span className="text-xs text-muted-foreground line-clamp-2">
                                  {tool.description}
                                </span>
                              </div>
                            </div>
                            <Checkbox
                              className="mt-1"
                              id={`tool-${workspace.id}-${tool.name}`}
                              checked={isToolSelected(workspace.id, tool.name)}
                              onCheckedChange={() =>
                                handleToolChange(workspace.id, tool.name)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 border-t bg-muted/10 mt-auto flex justify-end gap-3">
            <Button
              variant="outline"
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={isPending} type="submit">
              Create Permission
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateMcpPermission;
