import { createFileRoute } from '@tanstack/react-router';
import AgentsChatPage from '@/pages/agents/agents';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute(
  '/_authed/agents/conversations/$conversationId',
)({
  component: () => (
    <RequireWorkspace>
      <AgentsChatPage />
    </RequireWorkspace>
  ),
});
