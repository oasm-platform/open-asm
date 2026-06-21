import { createFileRoute } from '@tanstack/react-router';
import Reports from '@/pages/reports/reports';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/reports')({
  component: () => (
    <RequireWorkspace>
      <Reports />
    </RequireWorkspace>
  ),
});
