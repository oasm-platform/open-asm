import { createFileRoute } from '@tanstack/react-router';
import AgentsChatPage from '@/pages/agents/agents';

export const Route = createFileRoute(
  '/_authed/agents/conversations/$conversationId',
)({
  component: () => (
      <AgentsChatPage />
  ),
});
