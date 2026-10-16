import { ToolConnectorConfigSheet } from '@/components/tools/tool-connector-config-sheet';
import { Badge } from '@/components/ui/badge';
import LogoFrame from '@/components/ui/logo-frame';
import ToolLogo from '@/components/ui/tool-logo';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  getToolsControllerGetInstalledToolsQueryKey,
  getToolsControllerGetManyToolsQueryKey,
  ToolsControllerGetManyToolsType,
  type Tool,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { BadgeCheck } from 'lucide-react';
import { useState } from 'react';
import ToolInstallButton from './tool-install-button';

interface ToolCardProps {
  tool: Tool;
  /** Runs before going to the tool detail page, e.g. to close a dialog. */
  onNavigate?: () => void;
  /**
   * Where the card is shown. From the tools page, installing a connector
   * opens its configuration; from agent settings it stays on the list.
   * Default 'tools'.
   */
  openFrom?: 'tools' | 'agent-settings';
}

function formatCategory(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const ToolCard = ({ tool, onNavigate, openFrom = 'tools' }: ToolCardProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const [configOpen, setConfigOpen] = useState(false);
  const isConnector = tool.type === ToolsControllerGetManyToolsType.connector;

  const openDetail = (search?: {
    tab: string;
    openCreateToolConfiguration: boolean;
  }) => {
    onNavigate?.();
    void navigate({ to: '/tools/$id', params: { id: tool.id }, search });
  };

  const handleInstallChange = () => {
    void queryClient.invalidateQueries({
      queryKey: getToolsControllerGetManyToolsQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getToolsControllerGetInstalledToolsQueryKey(),
    });
    // Same as the detail page: a freshly installed connector needs a
    // configuration profile, so land on its create sheet (tools page only).
    if (openFrom === 'tools' && !tool.isInstalled && isConnector) {
      openDetail({ tab: 'configuration', openCreateToolConfiguration: true });
    }
  };

  return (
    // The detail link is a full-card overlay, so the install button can sit
    // beside it instead of nested inside a button
    <div className="relative flex h-full flex-col items-start gap-2 rounded-lg border p-5 text-left transition-colors hover:border-primary hover:bg-accent/50">
      <button
        type="button"
        aria-label={tool.name}
        onClick={() => openDetail()}
        className="absolute inset-0 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <LogoFrame className="shrink-0 overflow-hidden">
            <ToolLogo name={tool.name} logoUrl={tool.logoUrl} size={24} />
          </LogoFrame>
          <h3 className="text-base font-semibold">{tool.name}</h3>
          {tool.isOfficialSupport && (
            <span title="Official" className="inline-flex shrink-0">
              <BadgeCheck className="size-4 text-blue-500" />
            </span>
          )}
          <Badge variant="secondary">{formatCategory(tool.category)}</Badge>
        </div>
        <div className="relative z-10 shrink-0">
          <ToolInstallButton
            tool={tool}
            workspaceId={selectedWorkspaceId || ''}
            onInstallChange={handleInstallChange}
            size="sm"
            className="h-7 min-w-20 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg]:mr-0 [&_svg]:size-3.5"
            onConfigure={isConnector ? () => setConfigOpen(true) : undefined}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-2">
        {tool.description || 'No description available.'}
      </p>
      {isConnector && (
        // Same create-profile sheet as the Configuration tab of the detail page
        <ToolConnectorConfigSheet
          open={configOpen}
          onOpenChange={setConfigOpen}
          tool={tool}
        />
      )}
    </div>
  );
};

export default ToolCard;
