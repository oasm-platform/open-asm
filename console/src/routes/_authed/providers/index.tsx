import { createFileRoute } from '@tanstack/react-router';
import ProvidersPage from '@/pages/providers/providers';

export const Route = createFileRoute('/_authed/providers/')({
  component: () => (
      <ProvidersPage />
  ),
});
