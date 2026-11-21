import { Badge } from '@/components/ui/badge';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import type { Workspace } from '@/services/apis/gen/queries';
import { useT } from '@/lib/i18n-dictionary';

interface ShowNameWorkspaceProps {
  workspace: Workspace;
}
const ShowNameWorkspace = ({ workspace }: ShowNameWorkspaceProps) => {
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  return (
    <div>
      <div className="font-medium">
        {workspace.name}{' '}
        {selectedWorkspaceId === workspace.id && (
          <Badge variant="outline">{t('settings.workspace.current')}</Badge>
        )}
      </div>
    </div>
  );
};

export default ShowNameWorkspace;
