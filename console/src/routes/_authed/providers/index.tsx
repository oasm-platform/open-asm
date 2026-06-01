import { createFileRoute } from '@tanstack/react-router';
import ProvidersPage from '@/pages/providers/providers';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/providers/')({
  component: () => (
    <RequireWorkspace>
      <ProvidersPage />
    </RequireWorkspace>
  ),
});
