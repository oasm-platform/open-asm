import { createFileRoute } from '@tanstack/react-router';
import ProvidersConnectPage from '@/pages/agents/providers-connect';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/agents/providers/connect')({
  component: () => (
    <RequireWorkspace>
      <ProvidersConnectPage />
    </RequireWorkspace>
  ),
});
