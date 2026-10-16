import { ToolInstallConfirmDialog } from "@/components/tools/tool-install-confirm-dialog";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ToolsControllerGetManyToolsType,
  useToolsControllerInstallTool,
  useToolsControllerUninstallTool,
  type Tool,
} from "@/services/apis/gen/queries";
import {
  CheckCircle,
  ChevronDown,
  Download,
  Loader2,
  Settings2,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import { toast } from "sonner";

interface ToolInstallButtonProps {
  tool: Tool;
  workspaceId: string;
  onInstallChange?: () => void;
  /** Size of every rendered button, e.g. "sm" on a card. */
  size?: ComponentProps<typeof Button>["size"];
  /** Applied to every rendered button so the parent can control layout (e.g. w-full). */
  className?: string;
  /**
   * Once installed, show a split [Config | v] button instead of "Installed":
   * Config calls this, the menu holds Uninstall. Ignored for built-in tools.
   */
  onConfigure?: () => void;
}

const ToolInstallButton = ({
  tool,
  workspaceId,
  onInstallChange,
  size,
  className,
  onConfigure,
}: ToolInstallButtonProps) => {
  const [isInstalled, setIsInstalled] = useState(tool.isInstalled);
  const [confirmUninstall, setConfirmUninstall] = useState(false);

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

  // Installed with onConfigure: split [Config | v], uninstall in the menu
  if (isInstalled && onConfigure && !isBuiltIn) {
    return (
      <>
        <ButtonGroup>
          <Button
            variant="outline"
            size={size}
            className={className}
            disabled={uninstallToolMutation.isPending}
            onClick={onConfigure}
          >
            <Settings2 className="size-4" />
            Config
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size={size}
                aria-label="More actions"
                className={cn(className, "min-w-0 px-1.5 has-[>svg]:px-1.5")}
                disabled={uninstallToolMutation.isPending}
              >
                {uninstallToolMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmUninstall(true)}
              >
                <Trash2 />
                Uninstall
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
        <ConfirmDialog
          open={confirmUninstall}
          onOpenChange={setConfirmUninstall}
          title="Remove Tool"
          description={`Are you sure you want to remove "${tool.name}"?`}
          onConfirm={handleUninstall}
        />
      </>
    );
  }

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
            size={size}
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
          size={size}
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