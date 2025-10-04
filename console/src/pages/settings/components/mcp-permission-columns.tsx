import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMcpControllerDeleteMcpPermissionById, type McpPermission } from "@/services/apis/gen/queries";
import { useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
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