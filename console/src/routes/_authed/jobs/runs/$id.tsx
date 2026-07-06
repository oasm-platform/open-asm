import { createFileRoute } from '@tanstack/react-router';
import Runs from '@/pages/jobs-registry/runs';

export const Route = createFileRoute('/_authed/jobs/runs/$id')({
  component: () => (
      <Runs />
  ),
});
