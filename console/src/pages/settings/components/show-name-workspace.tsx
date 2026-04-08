import { Badge } from '@/components/ui/badge';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import type { Workspace } from '@/services/apis/gen/queries';

interface ShowNameWorkspaceProps {
  workspace: Workspace;
}
const ShowNameWorkspace = ({ workspace }: ShowNameWorkspaceProps) => {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  return (
    <div>
      <div className="font-medium">
        {workspace.name}{' '}
        {selectedWorkspaceId === workspace.id && (
          <Badge variant="outline">Current</Badge>
        )}
      </div>
    </div>
  );
};

export default ShowNameWorkspace;
