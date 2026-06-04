import { createFileRoute } from '@tanstack/react-router';
import JobsRegistryPage from '@/pages/jobs-registry/jobs-registry';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/jobs/')({
  component: () => (
    <RequireWorkspace>
      <JobsRegistryPage />
    </RequireWorkspace>
  ),
});
