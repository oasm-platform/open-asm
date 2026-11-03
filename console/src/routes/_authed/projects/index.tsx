import { createFileRoute } from '@tanstack/react-router';
import { Projects } from '@/pages/projects/projects';

export const Route = createFileRoute('/_authed/projects/')({
  component: () => (
      <Projects />
  ),
});
