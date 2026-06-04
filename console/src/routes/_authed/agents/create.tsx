import { createFileRoute } from '@tanstack/react-router';
import CreateAgentPage from '@/pages/agents/create-agent';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/agents/create')({
  component: () => (
    <RequireWorkspace>
      <CreateAgentPage />
    </RequireWorkspace>
  ),
});
