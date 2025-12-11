import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Edit, RefreshCw } from 'lucide-react';
import type {
  McpServerConfig,
  McpServerConfigWithStatus,
} from '../../types/mcp';
import { McpServerItem } from './mcp-server-item';

interface McpServerListProps {
  servers: Record<string, McpServerConfigWithStatus>;
  isLoading: boolean;
  onToggle: (name: string, currentConfig: McpServerConfig) => Promise<void>;
  onDelete: (name: string) => void;
  onRefresh: () => void;
  onEditGlobal: () => void;
  onToolToggle: (serverName: string) => Promise<void> | void;
}

export function McpServerList({
  servers,
  isLoading,
  onToggle,
  onDelete,
  onRefresh,
  onEditGlobal,
  onToolToggle,
}: McpServerListProps) {
  const serverCount = Object.keys(servers).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground">
          Configured Servers ({serverCount})
        </h3>
      </div>

      {/* Accordion List */}
      <Accordion type="single" collapsible className="w-full space-y-2">
        {Object.entries(servers).map(([name, config]) => (
          <McpServerItem
            key={name}
            name={name}
            config={config}
            onToggle={onToggle}
            onDelete={onDelete}
            onRefresh={onRefresh}
            onToolToggle={onToolToggle}
          />
        ))}

        {serverCount === 0 && !isLoading && (
          <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground border-2 border-dashed rounded-lg gap-2">
            <p>No servers configured.</p>
          </div>
        )}
      </Accordion>

      {/* Action Buttons */}
      <div className="flex gap-2 mt-6">
        <Button
          variant="default"
          className="h-10 justify-start text-xs sm:text-sm flex-1"
          onClick={onEditGlobal}
        >
          <Edit className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden xs:inline">Edit MCP Servers</span>
          <span className="xs:hidden">Edit MCP</span>
        </Button>

        <Button
          variant="secondary"
          className="h-10 justify-start text-xs sm:text-sm flex-1"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw
            className={`mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 ${isLoading ? 'animate-spin' : ''}`}
          />
          <span className="hidden xs:inline">Refresh MCP Servers</span>
          <span className="xs:hidden">Refresh</span>
        </Button>
      </div>
    </div>
  );
}
