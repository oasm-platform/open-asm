import { createFileRoute } from '@tanstack/react-router';
import Workspaces from '@/pages/workspaces';

export const Route = createFileRoute('/_authed/workspaces/')({
  component: () => (
      <Workspaces />
  ),
});
