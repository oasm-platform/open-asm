import { createFileRoute } from '@tanstack/react-router';
import ProjectDetail from '@/pages/projects/project-detail';

export const Route = createFileRoute('/_authed/projects/$id')({
  component: () => (
      <ProjectDetail />
  ),
});
