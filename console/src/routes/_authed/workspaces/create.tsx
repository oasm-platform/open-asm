import { createFileRoute } from '@tanstack/react-router';
import CreateWorkspace from '@/pages/workspaces/create-workspace';

export const Route = createFileRoute('/_authed/workspaces/create')({
  component: CreateWorkspace,
});
