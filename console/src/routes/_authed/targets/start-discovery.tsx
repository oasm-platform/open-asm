import { createFileRoute } from '@tanstack/react-router';
import StartDiscovery from '@/pages/targets/start-discovery';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/targets/start-discovery')({
  component: () => (
    <RequireWorkspace>
      <StartDiscovery />
    </RequireWorkspace>
  ),
});
