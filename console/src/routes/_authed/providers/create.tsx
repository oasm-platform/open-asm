import { createFileRoute } from '@tanstack/react-router';
import CreateProviderPage from '@/pages/providers/create-provider';

export const Route = createFileRoute('/_authed/providers/create')({
  component: () => (
      <CreateProviderPage />
  ),
});
