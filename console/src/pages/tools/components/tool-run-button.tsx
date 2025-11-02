import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToolsControllerRunTool, type Tool } from "@/services/apis/gen/queries";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface ToolRunButtonProps {
  tool: Tool;
  workspaceId: string;
}

const ToolRunButton = ({ tool, workspaceId }: ToolRunButtonProps) => {
  const { search } = window.location;
  const urlParams = new URLSearchParams(search);
  const assetId = urlParams.get("assetId") || "";

  const { mutate } = useToolsControllerRunTool()
  const handleRun = () => {
    // Check if workspaceId exists
    if (!workspaceId) {
      toast("No workspace selected");
      return;
    }

    mutate({
      id: tool.id,
      data: {
        assetIds: [assetId]
      }
    }, {
      onSuccess: () => {
        toast.success(`Tool "${tool.name}" is being run`);
      },
      onError: () => {
        toast.error(`Failed to run tool "${tool.name}"`);
      }
    })
  };

  return (
    <ConfirmDialog
      title="Run Tool"
      description={`Are you sure you want to run "${tool.name}"?`}
      onConfirm={handleRun}
      trigger={
        <Button
          variant="default"
        >
          Run
          <ArrowRight className="h-4 w-4" />
        </Button>
      }
    />
  );
};

export default ToolRunButton;