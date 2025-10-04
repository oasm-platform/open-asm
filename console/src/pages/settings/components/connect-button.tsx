import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMcpControllerGetMcpApiKey, type McpPermission } from '@/services/apis/gen/queries';
import { Copy, Plug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ConnectMcpButtonProps {
  permission: McpPermission
}
const ConnectMcpButton = (props: ConnectMcpButtonProps) => {
  const [open, setOpen] = useState(false);
  const { permission } = props;

  // Use the hook with enabled option to control when the API call is made
  const { data } = useMcpControllerGetMcpApiKey(permission.id, {
    query: {
      enabled: open // Only fetch when dialog is open
    }
  });

  const jsonContent =
    `{
  "mcpServers": {
    "oasm-platform": {
      "url": "${window.location.origin}/api/mcp",
      "headers": {
        "mcp-api-key": "${data?.apiKey}"
      }
    }
  }
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonContent).then(() => {
      toast.success("Configuration copied to clipboard");
    }).catch((err) => {
      console.error('Failed to copy: ', err);
      toast.error("Failed to copy configuration");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plug className="w-4 h-4 mr-2" />
          Connect
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to MCP Server</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <div className="mb-4">
            <pre className="p-3 rounded-md text-xs overflow-x-auto border bg-background">
              {jsonContent}
            </pre>
          </div>
          <Button variant={"outline"} onClick={handleCopy} className="w-full">
            <Copy /> Copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectMcpButton;