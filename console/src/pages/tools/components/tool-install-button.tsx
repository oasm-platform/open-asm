import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToolConnectorConfigSheet } from "@/components/tools/tool-connector-config-sheet";
import {
  ToolsControllerGetManyToolsType,
  useToolConfigProfilesControllerList,
  useToolsControllerInstallTool,
  useToolsControllerUninstallTool,
  type Tool,
} from "@/services/apis/gen/queries";
import { CheckCircle, Plus, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** Backend-augmented fields not yet in orval-generated Tool type. */
interface ToolWithConfig extends Tool {
  hasConfigProfile?: boolean;
}

/** Extended profile shape returned by the API (orval type is incomplete). */
interface ProfileWithMeta {
  id: string;
  name: string;
  config: Record<string, unknown>;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ToolInstallButtonProps {
  tool: Tool;
  workspaceId: string;
  onInstallChange?: () => void;
}

const ToolInstallButton = ({
  tool,
  workspaceId,
  onInstallChange,
}: ToolInstallButtonProps) => {
  const [isInstalled, setIsInstalled] = useState(tool.isInstalled);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  useEffect(() => {
    setIsInstalled(tool.isInstalled);
  }, [tool.isInstalled]);

  const installToolMutation = useToolsControllerInstallTool();
  const uninstallToolMutation = useToolsControllerUninstallTool();

  const isConnector =
    tool.type === ToolsControllerGetManyToolsType.connector;
  const isBuiltIn =
    tool.type === ToolsControllerGetManyToolsType.built_in;

  // Backend-augmented flag: tool has at least one config profile
  const hasConfigProfile =
    isConnector && Boolean((tool as ToolWithConfig).hasConfigProfile);

  // Disable install when no workers are online
  const noWorkers =
    !tool.availableWorkersCount || tool.availableWorkersCount === 0;

  // Fetch existing profiles only when we may need to edit one
  const { data: profilesRaw } = useToolConfigProfilesControllerList(tool.id, {
    query: { enabled: isInstalled && hasConfigProfile },
  });

  const profiles = (profilesRaw ?? []) as unknown as ProfileWithMeta[];

  // Edit the default profile when present, otherwise the first one
  const editingProfile =
    profiles.find((profile) => profile.isDefault) ?? profiles[0];
  const initialData = editingProfile
    ? {
        id: editingProfile.id,
        name: editingProfile.name,
        config: editingProfile.config,
        isDefault: editingProfile.isDefault,
      }
    : undefined;

  const handleInstall = () => {
    if (!workspaceId) {
      toast.error("No workspace selected");
      return;
    }

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

  const handleConnectorAdd = () => {
    if (!workspaceId) {
      toast.error("No workspace selected");
      return;
    }

    // Already installed — just open config sheet
    if (isInstalled) {
      setIsConfigOpen(true);
      return;
    }

    // Install first, then open sheet on success
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
          setIsConfigOpen(true);
        },
        onError: () => {
          setIsInstalled(false);
          toast.error("Failed to add tool");
        },
      },
    );
  };

  // --- Connector tool ---
  if (isConnector) {
    // Installed but no config profile yet: show Configure
    if (isInstalled && !hasConfigProfile) {
      return (
        <>
          <Button variant="outline" onClick={() => setIsConfigOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Configure
          </Button>
          <ToolConnectorConfigSheet
            open={isConfigOpen}
            onOpenChange={setIsConfigOpen}
            tool={tool}
            initialData={initialData}
            onSuccess={onInstallChange}
          />
        </>
      );
    }

    // Installed and configured: show Edit (config sheet) + Added (uninstall),
    // or when not installed: show Add
    return (
      <>
        {isInstalled ? (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Edit configuration for ${tool.name}`}
              onClick={() => setIsConfigOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <ConfirmDialog
              title="Remove Tool"
              description={`Are you sure you want to remove "${tool.name}"?`}
              onConfirm={handleUninstall}
              trigger={
                <Button
                  variant="outline"
                  disabled={uninstallToolMutation.isPending}
                >
                  {uninstallToolMutation.isPending ? (
                    "Removing..."
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Added
                    </>
                  )}
                </Button>
              }
            />
          </>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="default"
                    onClick={handleConnectorAdd}
                    disabled={installToolMutation.isPending || noWorkers}
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
                </span>
              </TooltipTrigger>
              {noWorkers && (
                <TooltipContent>
                  <p>{`"${tool.name}" requires at least one worker online.`}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
        <ToolConnectorConfigSheet
          open={isConfigOpen}
          onOpenChange={setIsConfigOpen}
          tool={tool}
          initialData={initialData}
          onSuccess={onInstallChange}
        />
      </>
    );
  }

  // --- Built-in / provider tool ---

  // Installed: show Added / Built-in
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

  // Not installed: ConfirmDialog Add
  return (
    <ConfirmDialog
      title="Add Tool"
      description={
        noWorkers
          ? `"${tool.name}" requires at least one worker online.`
          : `Are you sure you want to add "${tool.name}"?`
      }
      disabled={noWorkers}
      onConfirm={handleInstall}
      trigger={
        <Button
          variant="default"
          disabled={installToolMutation.isPending || noWorkers}
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
