import { createFileRoute } from '@tanstack/react-router';
import Workspaces from '@/pages/workspaces';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/workspaces/')({
  component: () => (
    <RequireWorkspace>
      <Workspaces />
    </RequireWorkspace>
  ),
});
