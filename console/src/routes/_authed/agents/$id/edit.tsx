import { createFileRoute } from '@tanstack/react-router';
import EditAgentPage from '@/pages/agents/edit-agent';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/agents/$id/edit')({
  component: () => (
    <RequireWorkspace>
      <EditAgentPage />
    </RequireWorkspace>
  ),
});
