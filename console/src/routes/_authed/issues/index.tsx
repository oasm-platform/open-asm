import { createFileRoute } from '@tanstack/react-router';
import Issues from '@/pages/issues/issues';

export const Route = createFileRoute('/_authed/issues/')({
  component: () => (
      <Issues />
  ),
});
