import { createFileRoute } from '@tanstack/react-router';
import CreateAgentPage from '@/pages/agents/create-agent';

export const Route = createFileRoute('/_authed/agents/create')({
  component: () => (
      <CreateAgentPage />
  ),
});
