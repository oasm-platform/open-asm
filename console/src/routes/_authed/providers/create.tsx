import { createFileRoute } from '@tanstack/react-router';
import CreateProviderPage from '@/pages/providers/create-provider';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/providers/create')({
  component: () => (
    <RequireWorkspace>
      <CreateProviderPage />
    </RequireWorkspace>
  ),
});
