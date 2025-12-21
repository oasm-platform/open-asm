import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Trash2, RefreshCw, ChevronDown, Save } from 'lucide-react';
import type {
  McpServerConfig,
  McpServerConfigWithStatus,
} from '../../types/mcp';
import { McpServerTabs } from './mcp-server-tabs';
import { useMcp } from '../../context/mcp-context';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface McpServerItemProps {
  name: string;
  config: McpServerConfigWithStatus;
  onToggle: (name: string, currentConfig: McpServerConfig) => Promise<void>;
  onDelete: (name: string) => void;
  onRefresh: () => void;
  onToolToggle: (serverName: string) => Promise<void> | void;
}

export function McpServerItem({
  name,
  config,
  onToggle,
  onDelete,
  onRefresh,
  onToolToggle,
}: McpServerItemProps) {
  const { pendingToolChanges, setPendingToolChanges } = useMcp();

  const hasPendingChanges = pendingToolChanges[name] !== undefined;

  const handleSaveChanges = async () => {
    if (hasPendingChanges) {
      // Trigger the save by calling onToolToggle with just the server name
      await onToolToggle(name);

      // Clear pending changes for this server
      setPendingToolChanges((prev) => {
        const newChanges = { ...prev };
        delete newChanges[name];
        return newChanges;
      });
    }
  };

  return (
    <AccordionItem
      value={name}
      className="border rounded-lg bg-card px-0 group"
    >
      <div className="flex items-center justify-between px-4 py-2">
        <AccordionTrigger className="hover:no-underline py-0 flex-1 [&>svg]:hidden">
          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                config.status === 'active'
                  ? 'bg-green-500'
                  : config.status === 'disabled'
                    ? 'bg-gray-400'
                    : 'bg-red-500'
              }`}
            />
            <span className="font-medium">{name}</span>
            <Badge
              variant="secondary"
              className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground"
            >
              project
            </Badge>
            {hasPendingChanges && (
              <Badge
                variant="default"
                className="text-[10px] h-5 px-1.5 font-normal bg-orange-500 hover:bg-orange-600"
              >
                Unsaved
              </Badge>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </div>
        </AccordionTrigger>

        {/* Actions Row */}
        <div className="flex items-center gap-2 ml-4">
          <ConfirmDialog
            title="Delete MCP Server"
            description={`Are you sure you want to delete the MCP server '${name}'?`}
            onConfirm={() => onDelete(name)}
            confirmText="Delete"
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Switch
            checked={!config.disabled}
            onCheckedChange={() => onToggle(name, config)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      <AccordionContent className="px-4 pb-4 pt-0 border-t">
        <McpServerTabs serverName={name} config={config} />

        {/* Save Changes Button */}
        {hasPendingChanges && (
          <div className="mt-4 pt-4 border-t">
            <Button
              onClick={handleSaveChanges}
              className="w-full"
              variant="default"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        )}

        {/* Additional Info / Footer */}
        <div className="mt-4 pt-4 border-t flex items-center text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Timeout: {config.timeout || 60}s</span>
            {config.allowed_tools && config.allowed_tools.length > 0 && (
              <span className="ml-2">
                • {config.allowed_tools.length} tool(s) allowed
              </span>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
