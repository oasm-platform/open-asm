import { createFileRoute } from '@tanstack/react-router';
import WorkspaceDetail from '@/modules/admin/pages/workspace-detail';

export const Route = createFileRoute('/admin/workspaces/$id')({
  component: WorkspaceDetail,
});
