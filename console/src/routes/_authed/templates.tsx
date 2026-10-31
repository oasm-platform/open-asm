import { createFileRoute } from '@tanstack/react-router';
import Templates from '@/pages/templates/templates';

export const Route = createFileRoute('/_authed/templates')({
  component: () => <Templates />,
});
