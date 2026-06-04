import { createFileRoute } from '@tanstack/react-router';
import Dashboard from '@/pages/dashboard/dashboard';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/')({
  component: () => (
    <RequireWorkspace>
      <Dashboard />
    </RequireWorkspace>
  ),
});
