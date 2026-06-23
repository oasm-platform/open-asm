import { useToolsControllerGetManyTools } from '@/services/apis/gen/queries';
import { LayoutGrid } from 'lucide-react';
import ToolsList from '../tools-list';
import ToolInstallButton from './tool-install-button';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';

const Marketplace = () => {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading } = useToolsControllerGetManyTools(
    {},
    {
      query: {
        queryKey: [selectedWorkspaceId],
        enabled: !!selectedWorkspaceId,
      },
    },
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
