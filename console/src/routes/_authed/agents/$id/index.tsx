import { createFileRoute } from '@tanstack/react-router';
import AgentDetail from '@/pages/agents/agent-detail';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/agents/$id/')({
  component: () => (
    <RequireWorkspace>
      <AgentDetail />
    </RequireWorkspace>
  ),
});
