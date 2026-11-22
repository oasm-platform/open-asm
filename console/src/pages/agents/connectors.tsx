import Page from '@/components/common/page';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import ToolCard from '@/pages/tools/components/tool-card';
import { useToolsControllerGetManyTools } from '@/services/apis/gen/queries';
import { useT } from '@/lib/i18n-dictionary';

/**
 * The tools the agent can use (built-in tools + agent connectors). A card
 * opens the tool detail page.
 */
export default function AgentConnectorsPage() {
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data, isLoading } = useToolsControllerGetManyTools(
    { agentTool: true, limit: 100 },
    { query: { enabled: !!selectedWorkspaceId } },
  );
  const tools = data?.data ?? [];

  return (
    <Page
      title={t('agents.connectors.title')}
      description={t('agents.connectors.description')}
      // max-md:pt-10 clears the sidebar trigger floating at the top-left
      className="mx-auto w-full max-w-5xl max-md:pt-10"
      permission="agent.read"
    >
      <div className="pb-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 rounded-lg border animate-pulse bg-muted/30"
              />
            ))}
          </div>
        ) : tools.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('agents.connectors.empty')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} openFrom="aistudio" />
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
