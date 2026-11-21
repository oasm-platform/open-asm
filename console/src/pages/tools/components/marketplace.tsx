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
import { useT } from '@/lib/i18n-dictionary';

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
  const t = useT();
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
            ? t('tools.list.noMatch')
            : installed
              ? t('tools.list.noInstalled')
              : t('tools.list.empty')
        }
        emptyDescription={
          hasFilters ? t('tools.list.noMatchDescription') : undefined
        }
      />
    </div>
  );
};

export default Marketplace;
