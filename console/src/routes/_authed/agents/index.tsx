import { createFileRoute } from '@tanstack/react-router';
import AgentsLandingPage from '@/pages/agents/agents-landing';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/agents/')({
  component: () => (
    <RequireWorkspace>
      <AgentsLandingPage />
    </RequireWorkspace>
  ),
});
