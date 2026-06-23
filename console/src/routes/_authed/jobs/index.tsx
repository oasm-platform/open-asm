import { createFileRoute } from '@tanstack/react-router';
import JobsRegistryPage from '@/pages/jobs-registry/jobs-registry';

export const Route = createFileRoute('/_authed/jobs/')({
  component: () => (
      <JobsRegistryPage />
  ),
});
