import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useToolsControllerGetInstalledTools,
  useToolsControllerGetManyTools,
  type ToolsControllerGetInstalledToolsCategory,
  type ToolsControllerGetManyToolsCategory,
  type ToolsControllerGetManyToolsType,
} from '@/services/apis/gen/queries';
import { LayoutGrid } from 'lucide-react';
import ToolsList from '../tools-list';

interface MarketplaceProps {
  installed?: boolean;
  toolType?: ToolsControllerGetManyToolsType;
  search?: string;
  category?: ToolsControllerGetManyToolsCategory;
}

const Marketplace = ({
  installed = false,
  toolType,
  search,
  category,
}: MarketplaceProps) => {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading } = useToolsControllerGetManyTools(
    {
      type: installed ? undefined : toolType,
      category,
      limit: 100,
      search: installed ? undefined : search || undefined,
    },
    {
      query: {
        enabled: !installed && Boolean(selectedWorkspaceId),
      },
    },
  );
  const { data: installedData, isLoading: installedLoading } =
    useToolsControllerGetInstalledTools(
      {
        category:
          category as ToolsControllerGetInstalledToolsCategory | undefined,
      },
      {
        query: {
          enabled: installed && Boolean(selectedWorkspaceId),
        },
      },
    );

  const tools = installed ? installedData?.data : data?.data;
  const normalizedSearch = search?.trim().toLowerCase();
  const visibleTools =
    installed && normalizedSearch
      ? tools?.filter(
          (tool) =>
            tool.name.toLowerCase().includes(normalizedSearch) ||
            (tool.description ?? '').toLowerCase().includes(normalizedSearch),
        )
      : tools;
  const isCurrentTabLoading = installed ? installedLoading : isLoading;
  const hasFilters = !!(search || category || toolType);

  return (
    <div>
      <ToolsList
        data={visibleTools ?? []}
        isLoading={isCurrentTabLoading || !selectedWorkspaceId}
        icon={<LayoutGrid className="w-6 h-6" />}
        emptyMessage={
          hasFilters
            ? 'No tools match your filters'
            : installed
              ? 'No installed tools found'
              : 'No tools found'
        }
        emptyDescription={
          hasFilters ? 'Try a different search term or category.' : undefined
        }
      />
    </div>
  );
};

export default Marketplace;
