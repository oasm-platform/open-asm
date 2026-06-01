import { createFileRoute } from '@tanstack/react-router';
import InternalNetworkDetail from '@/pages/internal-networks/internal-network-detail';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/internal-networks/$id')({
  component: () => (
    <RequireWorkspace>
      <InternalNetworkDetail />
    </RequireWorkspace>
  ),
});
