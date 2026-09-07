import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ToolsControllerGetManyToolsType,
  useToolsControllerInstallTool,
  useToolsControllerUninstallTool,
  type Tool,
} from "@/services/apis/gen/queries";
import { CheckCircle, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface ToolInstallButtonProps {
  tool: Tool;
  workspaceId: string;
  onInstallChange?: () => void;
  /** Applied to every rendered button so the parent can control layout (e.g. w-full). */
  className?: string;
}

const ToolInstallButton = ({
  tool,
  workspaceId,
  onInstallChange,
  className,
}: ToolInstallButtonProps) => {
  const [isInstalled, setIsInstalled] = useState(tool.isInstalled);

  useEffect(() => {
    setIsInstalled(tool.isInstalled);
  }, [tool.isInstalled]);

  const installToolMutation = useToolsControllerInstallTool();
  const uninstallToolMutation = useToolsControllerUninstallTool();

  const isBuiltIn = tool.type === ToolsControllerGetManyToolsType.built_in;

  const handleInstall = () => {
    if (!workspaceId) {
      toast.error("No workspace selected");
      return;
    }

    // Optimistic: flip the state immediately; the refetch via onInstallChange
    // reconciles with the server.
    setIsInstalled(true);

    installToolMutation.mutate(
      {
        data: {
          toolId: tool.id,
          workspaceId: workspaceId,
        },
      },
      {
        onSuccess: () => {
          toast.success("Tool added successfully");
          if (onInstallChange) onInstallChange();
        },
        onError: () => {
          setIsInstalled(false);
          toast.error("Failed to add tool");
        },
      },
    );
  };

  const handleUninstall = () => {
    if (!workspaceId) {
      toast.error("No workspace selected");
      return;
    }

    // Optimistic: flip the state immediately; the refetch via onInstallChange
    // reconciles with the server.
    setIsInstalled(false);

    uninstallToolMutation.mutate(
      {
        data: {
          toolId: tool.id,
          workspaceId: workspaceId,
        },
      },
      {
        onSuccess: () => {
          toast.success("Tool removed successfully");
          if (onInstallChange) onInstallChange();
        },
        onError: () => {
          setIsInstalled(true);
          toast.error("Failed to remove tool");
        },
      },
    );
  };

  // Installed: confirm-guarded uninstall keeps the CTA meaningful (Added /
  // Built-in). Config lives in the Configuration tab, not here.
  if (isInstalled) {
    return (
      <ConfirmDialog
        title="Remove Tool"
        description={`Are you sure you want to remove "${tool.name}"?`}
        onConfirm={handleUninstall}
        disabled={isBuiltIn}
        trigger={
          <Button
            variant="outline"
            className={className}
            disabled={uninstallToolMutation.isPending || isBuiltIn}
          >
            {uninstallToolMutation.isPending ? (
              "Removing..."
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                {isBuiltIn ? "Built-in" : "Added"}
              </>
            )}
          </Button>
        }
      />
    );
  }

  // Connectors add without a confirm dialog (the user then creates a
  // configuration profile in the Configuration tab); other types keep the
  // confirm gate.
  if (tool.type === ToolsControllerGetManyToolsType.connector) {
    return (
      <Button
        variant="default"
        className={className}
        onClick={handleInstall}
        disabled={installToolMutation.isPending}
      >
        {installToolMutation.isPending ? (
          "Adding..."
        ) : (
          <>
            <Plus className="mr-2 h-4 w-4" />
            Add
          </>
        )}
      </Button>
    );
  }

  return (
    <ConfirmDialog
      title="Add Tool"
      description={`Are you sure you want to add "${tool.name}"?`}
      onConfirm={handleInstall}
      trigger={
        <Button
          variant="default"
          className={className}
          disabled={installToolMutation.isPending}
        >
          {installToolMutation.isPending ? (
            "Adding..."
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </>
          )}
        </Button>
      }
    />
  );
};

export default ToolInstallButton;