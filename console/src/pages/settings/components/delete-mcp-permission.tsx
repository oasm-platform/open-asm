import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMcpControllerDeleteMcpPermissionById } from "@/services/apis/gen/queries";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Component to handle deletion of MCP permission with confirmation dialog
 * Uses ConfirmDialog to show confirmation before executing the delete operation
 */
interface DeleteMcpPermissionProps {
  id: string;
  onDeleted?: () => void;
}

export const DeleteMcpPermission = ({ id, onDeleted }: DeleteMcpPermissionProps) => {
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
        <Button variant="ghost" size="icon" disabled={isPending}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      }
    />
  );
};