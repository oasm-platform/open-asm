import { createFileRoute } from '@tanstack/react-router';
import Settings from '@/pages/settings/settings';

export const Route = createFileRoute('/settings/')({
  component: () => (
      <Settings />
  ),
});
