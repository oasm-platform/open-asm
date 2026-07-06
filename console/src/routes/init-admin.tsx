import Register from '@/pages/register/register';
import { getRootControllerGetMetadataQueryOptions } from '@/services/apis/gen/queries';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/init-admin')({
  component: Register,
  beforeLoad: async ({ context }) => {
    const data = await context.queryClient
      .ensureQueryData(getRootControllerGetMetadataQueryOptions())
      .catch(() => null);
    if (data?.isInit) throw redirect({ to: '/login' });
  },
});
