import { createFileRoute } from '@tanstack/react-router';
import AgentDetail from '@/pages/agents/agent-detail';

export const Route = createFileRoute('/_authed/agents/$id/')({
  component: () => (
      <AgentDetail />
  ),
});
