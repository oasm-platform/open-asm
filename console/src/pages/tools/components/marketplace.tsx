import {
  useToolsControllerGetManyTools,
  type ToolsControllerGetManyToolsCategory,
  type ToolsControllerGetManyToolsType,
} from '@/services/apis/gen/queries';
import { LayoutGrid } from 'lucide-react';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import ToolsList from '../tools-list';

interface MarketplaceProps {
  toolType?: ToolsControllerGetManyToolsType;
  search?: string;
  category?: ToolsControllerGetManyToolsCategory;
}

const Marketplace = ({ toolType, search, category }: MarketplaceProps) => {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading } = useToolsControllerGetManyTools({
    type: toolType,
    category,
    search: search || undefined,
  });
  const hasFilters = !!(search || category || toolType);

  return (
    <div>
      <ToolsList
        data={data?.data ?? []}
        isLoading={isLoading || !selectedWorkspaceId}
        icon={<LayoutGrid className="w-6 h-6" />}
        emptyMessage={
          hasFilters ? 'No tools match your filters' : 'No tools found'
        }
        emptyDescription={
          hasFilters
            ? 'Try a different search term or category.'
            : undefined
        }
      />
    </div>
  );
};

export default Marketplace;