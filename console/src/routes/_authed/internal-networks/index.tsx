import { createFileRoute } from '@tanstack/react-router';
import InternalNetworks from '@/pages/internal-networks/internal-networks';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/internal-networks/')({
  component: () => (
    <RequireWorkspace>
      <InternalNetworks />
    </RequireWorkspace>
  ),
});
