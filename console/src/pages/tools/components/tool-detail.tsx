import Page from "@/components/common/page";
import { ToolApiKeyDialog } from '@/components/tools/tool-api-key-dialog';
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { ToolsControllerGetManyToolsType, useToolsControllerGetToolById } from "@/services/apis/gen/queries";
import { Hash, Verified } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ToolInstallButton from "./tool-install-button";
import ToolRunButton from "./tool-run-button";

export default function ToolDetail() {
  const { id } = useParams<{ id: string }>();
  const { selectedWorkspace } = useWorkspaceSelector();

  const { data: toolResponse, isLoading, error, refetch } = useToolsControllerGetToolById(
    id || "", {
    query: {
      queryKey: [selectedWorkspace, id]
    }
  },
  );

  // Local state to track installation status
  const [isInstalled, setIsInstalled] = useState(false);

  // Update local state when tool data changes
  useEffect(() => {
    if (toolResponse) {
      setIsInstalled(toolResponse.isInstalled);
    }
  }, [toolResponse]);

  // Callback function to update installation status
  const handleInstallChange = () => {
    setIsInstalled(prev => !prev);
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg">Loading tool details...</div>
      </div>
    );
  }

  if (error || !toolResponse) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg text-red-500">Error loading tool details</div>
      </div>
    );
  }

  const tool = toolResponse;

  // Format category name for display
  const formatCategory = (category: string | undefined) => {
    if (!category) return "N/A";
    return category
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <Page>
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Logo section - moved to the left */}
            <div className="flex-shrink-0">
              <div className="bg-white p-4 rounded-xl flex items-center justify-center w-32 h-32 mx-auto lg:mx-0">
                {tool.logoUrl ? (
                  <img
                    src={tool.logoUrl}
                    alt={tool.name}
                    className="max-h-24 object-contain"
                  />
                ) : (
                  <div className="h-24 w-24 flex items-center justify-center bg-gray-200 rounded-lg">
                    <span className="text-3xl font-bold text-gray-500">
                      {tool.name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Content section */}
            <div className="flex-1">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle className="text-3xl">{tool.name}</CardTitle>
                    {tool.isOfficialSupport && (
                      <Badge variant="default" className="gap-1">
                        <Verified className="w-4 h-4" />
                        Official
                      </Badge>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <ToolApiKeyDialog
                      tool={tool}
                    />
                    <ToolInstallButton
                      tool={tool}
                      workspaceId={selectedWorkspace || ""}
                      onInstallChange={handleInstallChange}
                    />
                    {(isInstalled || tool.isInstalled) && tool.type !== ToolsControllerGetManyToolsType.built_in && (
                      <ToolRunButton
                        tool={tool}
                        workspaceId={selectedWorkspace || ""}
                      />
                    )}

                  </div>
                </div>

                <p className="text-muted-foreground">
                  {tool.description || "No description available."}
                </p>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <Hash className="w-3 h-3" />
                    Version: {tool.version || "N/A"}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    Category: {formatCategory(tool.category)}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    Type: {tool.type === ToolsControllerGetManyToolsType.built_in ? "Built-in" : "Provider"}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

    </Page>
  );
}