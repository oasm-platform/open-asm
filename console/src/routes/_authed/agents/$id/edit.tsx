import { createFileRoute } from '@tanstack/react-router';
import EditAgentPage from '@/pages/agents/edit-agent';

export const Route = createFileRoute('/_authed/agents/$id/edit')({
  component: () => (
      <EditAgentPage />
  ),
});
