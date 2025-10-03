import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMcpControllerGetMcpApiKey } from '@/services/apis/gen/queries';
import { Plug } from "lucide-react";
import { useState } from "react";

interface ConnectButtonProps {
  id: string
}
const ConnectButton = (props: ConnectButtonProps) => {
  const [open, setOpen] = useState(false);

  // Use the hook with enabled option to control when the API call is made
  const { data } = useMcpControllerGetMcpApiKey(props.id, {
    query: {
      enabled: open // Only fetch when dialog is open
    }
  });

  const jsonContent = `{
  "mcpServers": {
    "oasm": {
      "url": "${window.location.origin}/api/mcp",
      "headers": {
        "apikey": "${data?.apiKey}"
      }
    }
  }
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonContent);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plug className="w-4 h-4 mr-2" />
          Connect
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to MCP Server</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <div className="mb-4">
            <pre className="p-3 rounded-md text-xs overflow-x-auto border bg-background">
              {jsonContent}
            </pre>
          </div>
          <Button onClick={handleCopy} className="w-full">
            Copy Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectButton;