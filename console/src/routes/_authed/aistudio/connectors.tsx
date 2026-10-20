import { createFileRoute } from '@tanstack/react-router';
import AgentConnectorsPage from '@/pages/agents/connectors';

export const Route = createFileRoute('/_authed/aistudio/connectors')({
  component: AgentConnectorsPage,
});
