import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useMcpControllerDeleteMcpPermissionById, type McpPermission } from "@/services/apis/gen/queries";
import { useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import ConnectMcpIconButton from "./connect-mcp-icon-button";

// Icon-only delete button with outlined style for the table
interface DeleteMcpPermissionProps {
  id: string;
  onDeleted?: () => void;
}

const DeleteMcpPermissionOutlined = ({ id, onDeleted }: DeleteMcpPermissionProps) => {
  const queryClient = useQueryClient();
  const { mutate: deleteMcpPermission, isPending } = useMcpControllerDeleteMcpPermissionById();

  const handleDelete = () => {
    deleteMcpPermission(
      { id },
      {
        onSuccess: () => {
          // Invalidate and refetch MCP permissions query to update the table
          queryClient.invalidateQueries({ queryKey: ["mcp-permissions"] });

          if (onDeleted) {
            onDeleted();
          }
        },
      }
    );
  };

  return (
    <ConfirmDialog
      title="Confirm MCP Permission Deletion"
      description="Are you sure you want to delete this MCP permission? This action cannot be undone."
      onConfirm={handleDelete}
      confirmText="Delete"
      cancelText="Cancel"
      disabled={isPending}
      trigger={
        <Button variant="outline" size="icon" disabled={isPending}>
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    />
  );
};

// Expandable row component to show detailed workspace permissions
const WorkspacePermissionDetails = ({ permission }: { permission: McpPermission }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { workspaces } = useWorkspaceSelector()
  
  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
      >
        {isExpanded ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
        {permission.value.length} Workspace{permission.value.length !== 1 ? 's' : ''}
        <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full px-2 py-0.5">
          {permission.value.reduce((total, permValue) => total + permValue.permissions.length, 0)} permission{permission.value.reduce((total, permValue) => total + permValue.permissions.length, 0) !== 1 ? 's' : ''}
        </span>
      </button>
      {isExpanded && (
        <div className="ml-4 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-4 py-2">
          {permission.value.map((permValue, index) => {
            const workspace = workspaces.find((ws) => ws.id === permValue.workspaceId);
            return (
              <div key={index} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-800 dark:text-gray-200">
                    {workspace?.name || 'Unknown Workspace'}
                  </div>
                  <span className="text-xs bg-blue-10 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-full px-2 py-1">
                    {permValue.permissions.length} permission{permValue.permissions.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {permValue.permissions.map((permission, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded px-2 py-1"
                    >
                      {permission}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const mcpPermissionColumns: ColumnDef<McpPermission, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    enableSorting: false, // Disable sorting for this column
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.getValue("name") || "Unnamed"}</div>
        <div className="text-gray-500 text-sm">{row.getValue("description") || "No description"}</div>
      </div>
    ),
  },
  {
    accessorKey: "value",
    header: "Workspaces & Permissions",
    enableSorting: false, // Disable sorting for this column
    cell: ({ row }) => <WorkspacePermissionDetails permission={row.original} />,
  },
  {
    accessorKey: "createdAt",
    header: "Created At",
    enableSorting: false, // Disable sorting for this column
    cell: ({ row }) => (
      <div className="text-gray-500">
        {new Date(row.original.createdAt).toLocaleDateString()}
      </div>
    ),
  },
  {
    id: "actions",
    header: "",
    enableSorting: false, // Disable sorting for this column
    cell: ({ row }) => (
      <div className="flex space-x-2 justify-end">
        <ConnectMcpIconButton id={row.original.id} />
        <DeleteMcpPermissionOutlined id={row.original.id} />
      </div>
    ),
  },
];