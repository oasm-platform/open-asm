import { Badge } from '@/components/ui/badge';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import type { Workspace } from '@/services/apis/gen/queries';

interface ShowNameWorkspaceProps {
    workspace: Workspace;
}
const ShowNameWorkspace = ({ workspace }: ShowNameWorkspaceProps) => {
    const { selectedWorkspace } = useWorkspaceSelector();
    return (
        <div>
            <div className="font-medium">{workspace.name} {selectedWorkspace === workspace.id && <Badge variant="outline">Current</Badge>}</div>
        </div>
    );
};

export default ShowNameWorkspace;