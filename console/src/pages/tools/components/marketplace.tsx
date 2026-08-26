import { useToolsControllerGetManyTools } from '@/services/apis/gen/queries';
import { LayoutGrid } from 'lucide-react';
import ToolsList from '../tools-list';
import ToolInstallButton from './tool-install-button';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';

interface MarketplaceProps {
  toolType?: string;
}

const Marketplace = ({ toolType }: MarketplaceProps) => {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading } = useToolsControllerGetManyTools(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolType ? ({ type: toolType } as any) : undefined,
  );
  return (
    <div>
      <ToolsList
        data={data?.data ?? []}
        isLoading={isLoading || !selectedWorkspaceId}
        icon={<LayoutGrid className="w-6 h-6" />}
        title="Marketplace"
        renderButton={(tool) => (
          <ToolInstallButton tool={tool} workspaceId={selectedWorkspaceId} />
        )}
      />
    </div>
  );
};

export default Marketplace;
