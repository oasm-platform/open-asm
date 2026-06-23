import { createFileRoute } from '@tanstack/react-router';
import Tools from '@/pages/tools/tools';

export const Route = createFileRoute('/_authed/tools/')({
  component: () => (
      <Tools />
  ),
});
