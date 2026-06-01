import { createFileRoute } from '@tanstack/react-router';
import Runs from '@/pages/jobs-registry/runs';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/jobs/runs/$id')({
  component: () => (
    <RequireWorkspace>
      <Runs />
    </RequireWorkspace>
  ),
});
