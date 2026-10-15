import { createFileRoute } from '@tanstack/react-router';
import AgentsChatPage from '@/pages/agents/agents';

export const Route = createFileRoute(
  '/_authed/aistudio/conversations/$conversationId',
)({
  component: () => (
      <AgentsChatPage />
  ),
});
