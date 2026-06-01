import { createFileRoute } from '@tanstack/react-router';
import Targets from '@/pages/targets/targets';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/targets/')({
  component: () => (
    <RequireWorkspace>
      <Targets />
    </RequireWorkspace>
  ),
});
