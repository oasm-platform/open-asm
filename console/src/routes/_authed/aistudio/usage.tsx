import { createFileRoute } from '@tanstack/react-router';
import AgentUsagePage from '@/pages/agents/usage';

export const Route = createFileRoute('/_authed/aistudio/usage')({
  component: AgentUsagePage,
});
