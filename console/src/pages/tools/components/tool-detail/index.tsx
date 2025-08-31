import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToolsControllerGetToolById } from "@/services/apis/gen/queries";
import { ArrowLeft, Calendar, Hash, RefreshCw, Verified } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

export default function ToolDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: tool, isLoading, error } = useToolsControllerGetToolById(id || "");
  const navigate = useNavigate();

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

  const handleBack = () => {
    navigate("/tools");
  };

  // Format category name
  const formatCategory = (category: string | undefined) => {
    if (!category) return "N/A";
    return category
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Format date
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <ScrollArea className="flex-grow min-h-0 pr-2 sm:pr-4 mt-4 [&>div>div]:!block">
      <div className="flex flex-col">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Tool Details</h1>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="bg-black dark:bg-white p-4 rounded-xl flex items-center justify-center">
                {tool.logoUrl ? (
                  <img
                    src={tool.logoUrl}
                    alt={tool.name}
                    className="h-20 object-contain"
                  />
                ) : (
                  <div className="h-20 w-20 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-lg">
                    <span className="text-3xl font-bold text-gray-500">
                      {tool.name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-3xl">{tool.name}</CardTitle>
                    {tool.isOfficialSupport && (
                      <Badge variant="default" className="gap-1">
                        <Verified className="w-4 h-4" />
                        Official
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground mt-2">
                  {tool.description || "No description available."}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Badge variant="secondary" className="gap-1">
                    <Hash className="w-3 h-3" />
                    {tool.version || "N/A"}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    {formatCategory(tool.category)}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    {tool.type === "BUILT_IN" ? "Built-in" : "Provider"}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Separator className="my-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Hash className="w-5 h-5" />
                  Tool Information
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="font-medium">Tool ID</span>
                    <span className="text-muted-foreground text-sm font-mono">
                      {tool.id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="font-medium">Category</span>
                    <span className="text-muted-foreground">
                      {formatCategory(tool.category)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="font-medium">Type</span>
                    <span className="text-muted-foreground">
                      {tool.type === "BUILT_IN" ? "Built-in" : "Provider"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Timestamps
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="font-medium">Created</span>
                    <span className="text-muted-foreground">
                      {formatDate(tool.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="font-medium">Last Updated</span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <RefreshCw className="w-4 h-4" />
                      {formatDate(tool.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}