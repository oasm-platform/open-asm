import { createFileRoute } from '@tanstack/react-router';
import Settings from '@/pages/settings/settings';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/settings/$tab')({
  component: () => (
    <RequireWorkspace>
      <Settings />
    </RequireWorkspace>
  ),
});
