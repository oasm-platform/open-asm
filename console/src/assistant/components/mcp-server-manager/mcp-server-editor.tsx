import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Code2, X, Loader2 } from 'lucide-react';
import { useMcp } from '../../context/mcp-context';

interface McpServerEditorProps {
  onSubmit: () => Promise<void>;
  onClose: () => void;
  isPending: boolean;
}

export function McpServerEditor({
  onSubmit,
  onClose,
  isPending,
}: McpServerEditorProps) {
  const { jsonInput, setJsonInput } = useMcp();

  return (
    <div className="flex-1 overflow-hidden p-6 bg-background flex flex-col gap-4 border-t">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Code2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Edit MCP Configuration</h3>
            <p className="text-xs text-muted-foreground">
              Edit the entire configuration in JSON format
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 relative min-h-0 flex flex-col gap-2">
        <Textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          className="font-mono text-sm flex-1 w-full resize-none p-4 custom-scrollbar"
          style={{
            scrollbarWidth: 'none',
          }}
          placeholder={`{\n  "mcpServers": {\n    "server-name": {\n      "url": "http://...",\n      "headers": {"api-key": "..."},\n      "timeout": 60,\n      "allowed_tools": null\n    }\n  }\n}`}
        />
      </div>

      <div className="flex justify-between items-center shrink-0 pt-2 border-t">
        <span className="text-xs text-muted-foreground">
          Configure advanced server settings including timeouts, execution
          environments, and tool access controls.
        </span>
        <Button onClick={onSubmit} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}
