import { createFileRoute } from '@tanstack/react-router';
import WorkerDetail from '@/pages/workers/detail-worker';

export const Route = createFileRoute('/_authed/workers/$id')({
  component: () => <WorkerDetail />,
});
