import { createFileRoute } from '@tanstack/react-router';
import AgentConversationsPage from '@/pages/agents/conversations';

export const Route = createFileRoute('/_authed/agents/conversations/')({
  component: () => (
      <AgentConversationsPage />
  ),
});
