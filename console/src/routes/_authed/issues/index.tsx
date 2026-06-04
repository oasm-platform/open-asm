import { createFileRoute } from '@tanstack/react-router';
import Issues from '@/pages/issues/issues';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/issues/')({
  component: () => (
    <RequireWorkspace>
      <Issues />
    </RequireWorkspace>
  ),
});
