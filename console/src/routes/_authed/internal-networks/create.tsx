import { createFileRoute } from '@tanstack/react-router';
import CreateInternalNetwork from '@/pages/internal-networks/create-internal-network';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/internal-networks/create')({
  component: () => (
    <RequireWorkspace>
      <CreateInternalNetwork />
    </RequireWorkspace>
  ),
});
