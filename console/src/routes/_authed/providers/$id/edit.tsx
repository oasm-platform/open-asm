import { createFileRoute } from '@tanstack/react-router';
import EditProviderPage from '@/pages/providers/edit-provider';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/providers/$id/edit')({
  component: () => (
    <RequireWorkspace>
      <EditProviderPage />
    </RequireWorkspace>
  ),
});
