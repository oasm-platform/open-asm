import { useAgentSettingsDialog } from '@/hooks/useAgentSettingsDialog';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import ToolCard from '@/pages/tools/components/tool-card';
import { useToolsControllerGetManyTools } from '@/services/apis/gen/queries';

/**
 * Read-only list of the tools the agent can use (built-in tools + agent
 * connectors). A card opens the tool detail page and closes the dialog.
 */
export function ConnectorsManager() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { close } = useAgentSettingsDialog();

  const { data, isLoading } = useToolsControllerGetManyTools(
    { agentTool: true, limit: 100 },
    { query: { enabled: !!selectedWorkspaceId } },
  );
  const tools = data?.data ?? [];

  if (!selectedWorkspaceId) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 rounded-lg border animate-pulse bg-muted/30"
          />
        ))}
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No tools available to the agent yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {tools.map((tool) => (
        <ToolCard
          key={tool.id}
          tool={tool}
          onNavigate={close}
          openFrom="agent-settings"
        />
      ))}
    </div>
  );
}
