import { createFileRoute } from '@tanstack/react-router';
import Assets from '@/pages/assets/assets';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/assets/')({
  component: () => (
    <RequireWorkspace>
      <Assets />
    </RequireWorkspace>
  ),
});
