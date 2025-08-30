import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import type { Tool } from "@/services/apis/gen/queries";

interface ToolInstallButtonProps {
  tool: Tool;
}

const ToolInstallButton = ({ tool }: ToolInstallButtonProps) => {
  return tool.isInstalled ? (
    <Button color="green" disabled={true}>
      <CheckCircle className="w-4 h-4" />
      Installed
    </Button>
  ) : (
    <Button variant="default">Install</Button>
  );
};

export default ToolInstallButton;