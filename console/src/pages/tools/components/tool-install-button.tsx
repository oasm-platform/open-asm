import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ToolsControllerGetManyToolsType, useToolsControllerInstallTool, useToolsControllerUninstallTool, type Tool } from "@/services/apis/gen/queries";
import { CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface ToolInstallButtonProps {
  tool: Tool;
  workspaceId: string; // Workspace ID where the tool will be installed
  onInstallChange?: () => void; // Callback when installation status changes
}

const ToolInstallButton = ({ tool, workspaceId, onInstallChange }: ToolInstallButtonProps) => {
  // State to track the installation status
  const [isInstalled, setIsInstalled] = useState(tool.isInstalled);

  // Update local state when the tool prop changes
  useEffect(() => {
    setIsInstalled(tool.isInstalled);
  }, [tool.isInstalled]);

  // Using mutation hook for install API
  const installToolMutation = useToolsControllerInstallTool();

  // Using mutation hook for uninstall API
  const uninstallToolMutation = useToolsControllerUninstallTool();

  const handleInstall = () => {
    // Check if workspaceId exists
    if (!workspaceId) {
      toast("No workspace selected");
      return;
    }

    // Immediately update the UI state
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
          toast("Tool installed successfully");
          // Call callback to update the interface
          if (onInstallChange) onInstallChange();
        },
        onError: () => {
          // Revert the UI state on error
          setIsInstalled(false);
          toast("Failed to install tool");
        },
      }
    );
  };

  const handleUninstall = () => {
    // Check if workspaceId exists
    if (!workspaceId) {
      toast("No workspace selected");
      return;
    }

    // Immediately update the UI state
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
          toast("Tool uninstalled successfully");
          // Call callback to update the interface
          if (onInstallChange) onInstallChange();
        },
        onError: () => {
          // Revert the UI state on error
          setIsInstalled(true);
          toast("Failed to uninstall tool");
        },
      }
    );
  };

  // If the tool is installed (based on local state), show the installed button with checkmark
  if (isInstalled) {
    // For built-in tools, they cannot be uninstalled
    const isBuiltIn = tool.type === ToolsControllerGetManyToolsType.built_in;

    return (
      <ConfirmDialog
        title="Uninstall Tool"
        description={`Are you sure you want to uninstall "${tool.name}"?`}
        onConfirm={handleUninstall}
        disabled={isBuiltIn}
        trigger={
          <Button
            variant="outline"
            disabled={uninstallToolMutation.isPending || isBuiltIn}
          >
            {uninstallToolMutation.isPending ? (
              "Uninstalling..."
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {isBuiltIn ? "Built-in" : "Installed"}
              </>
            )}
          </Button>
        }
      />
    );
  }

  // If the tool is not installed (based on local state), show the install button
  return (
    <ConfirmDialog
      title="Install Tool"
      description={`Are you sure you want to install "${tool.name}"?`}
      onConfirm={handleInstall}
      trigger={
        <Button variant="default" disabled={installToolMutation.isPending}>
          {installToolMutation.isPending ? (
            "Installing..."
          ) : (
            "Install"
          )}
        </Button>
      }
    />
  );
};

export default ToolInstallButton;