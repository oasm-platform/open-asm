import { createFileRoute } from '@tanstack/react-router';
import Workers from '@/pages/workers/workers';

export const Route = createFileRoute('/_authed/workers')({
  component: () => (
      <Workers />
  ),
});
