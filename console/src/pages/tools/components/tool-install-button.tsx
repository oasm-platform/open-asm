import { ToolInstallConfirmDialog } from "@/components/tools/tool-install-confirm-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  ToolsControllerGetManyToolsType,
  useToolsControllerInstallTool,
  useToolsControllerUninstallTool,
  type Tool,
} from "@/services/apis/gen/queries";
import { CheckCircle, Download, Loader2 } from "lucide-react";
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
        },
      },
      {
        onSuccess: () => {
          toast.success("Tool installed successfully");
          if (onInstallChange) onInstallChange();
        },
        onError: () => {
          setIsInstalled(false);
          toast.error("Failed to install tool");
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

  // Installed: confirm-guarded uninstall keeps the CTA meaningful (Installed /
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
            className={cn("min-w-32", className)}
            disabled={uninstallToolMutation.isPending || isBuiltIn}
          >
            {uninstallToolMutation.isPending ? (
              "Removing..."
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                {isBuiltIn ? "Built-in" : "Installed"}
              </>
            )}
          </Button>
        }
      />
    );
  }

  return (
    <ToolInstallConfirmDialog
      tool={tool}
      onConfirm={handleInstall}
      trigger={
        <Button
          variant="default"
          className={cn("min-w-32 gap-2 font-semibold shadow-sm", className)}
          disabled={installToolMutation.isPending}
        >
          {installToolMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Installing...
            </>
          ) : (
            <>
              <Download className="size-4" />
              Install
            </>
          )}
        </Button>
      }
    />
  );
};

export default ToolInstallButton;