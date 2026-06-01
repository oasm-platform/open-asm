import { createFileRoute } from '@tanstack/react-router';
import AgentConversationsPage from '@/pages/agents/conversations';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/agents/conversations/')({
  component: () => (
    <RequireWorkspace>
      <AgentConversationsPage />
    </RequireWorkspace>
  ),
});
