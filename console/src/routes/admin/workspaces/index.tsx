import { createFileRoute } from '@tanstack/react-router';
import Workspaces from '@/modules/admin/pages/workspaces';

export const Route = createFileRoute('/admin/workspaces/')({
  component: Workspaces,
});
