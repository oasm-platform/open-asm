import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { type Tool } from "@/services/apis/gen/queries";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface ToolRunButtonProps {
  tool: Tool;
  workspaceId: string;
}

const ToolRunButton = ({ tool, workspaceId }: ToolRunButtonProps) => {
  const handleRun = () => {
    // Check if workspaceId exists
    if (!workspaceId) {
      toast("No workspace selected");
      return;
    }

    // For now, show a message that this feature is not implemented
    toast.info(`Running tool "${tool.name}" is not yet implemented`, {
      description: "This feature will be available in a future release."
    });
  };

  return (
    <ConfirmDialog
      title="Run Tool"
      description={`Are you sure you want to run "${tool.name}"?`}
      onConfirm={handleRun}
      trigger={
        <Button
          variant="default"
          className="ml-2"
        >
          Run
          <ArrowRight className="h-4 w-4" />
        </Button>
      }
    />
  );
};

export default ToolRunButton;