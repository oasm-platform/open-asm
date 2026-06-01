import { createFileRoute } from '@tanstack/react-router';
import Workers from '@/pages/workers/workers';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/workers')({
  component: () => (
    <RequireWorkspace>
      <Workers />
    </RequireWorkspace>
  ),
});
