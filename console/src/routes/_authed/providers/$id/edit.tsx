import { createFileRoute } from '@tanstack/react-router';
import EditProviderPage from '@/pages/providers/edit-provider';

export const Route = createFileRoute('/_authed/providers/$id/edit')({
  component: () => (
      <EditProviderPage />
  ),
});
