import Page from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToolsControllerGetToolById } from "@/services/apis/gen/queries";
import { Calendar, Hash, RefreshCw, Verified } from "lucide-react";
import { useParams } from "react-router-dom";

export default function ToolDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: tool, isLoading, error } = useToolsControllerGetToolById(id || "");


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg">Loading tool details...</div>
      </div>
    );
  }

  if (error || !tool) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg text-red-500">Error loading tool details</div>
      </div>
    );
  }

  // Format category name for display
  const formatCategory = (category: string | undefined) => {
    if (!category) return "N/A";
    return category
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Format date for display
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Page title={tool.name} isShowButtonGoBack>
      <Card className="mb-6">
        <CardHeader>
          {/* Logo hiển thị full width trên mobile */}
          <div className="flex flex-col items-center mb-6 sm:hidden">
            <div className="bg-white p-4 rounded-xl flex items-center justify-center w-full max-w-xs">
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

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CardTitle className="text-3xl">{tool.name}</CardTitle>
                  {tool.isOfficialSupport && (
                    <Badge variant="default" className="gap-1 mt-2">
                      <Verified className="w-4 h-4" />
                      Official
                    </Badge>
                  )}
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
                    Type: {tool.type === "BUILT_IN" ? "Built-in" : "Provider"}
                  </Badge>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Hash className="w-5 h-5" />
                    Tool Information
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-muted-foreground">Tool ID</span>
                      <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {tool.id}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-muted-foreground">Category</span>
                      <span>{formatCategory(tool.category)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-muted-foreground">Type</span>
                      <span>{tool.type === "BUILT_IN" ? "Built-in" : "Provider"}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Timestamps
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-muted-foreground">Created</span>
                      <span>{formatDate(tool.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-muted-foreground">Last Updated</span>
                      <span className="flex items-center gap-1">
                        <RefreshCw className="w-4 h-4" />
                        {formatDate(tool.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Logo chỉ hiển thị trên tablet và desktop */}
            <div className="flex-col items-end hidden sm:flex">
              <div className="bg-white p-4 rounded-xl flex items-center justify-center w-32 h-32">
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
          </div>
        </CardHeader>
      </Card>
    </Page>
  );
}