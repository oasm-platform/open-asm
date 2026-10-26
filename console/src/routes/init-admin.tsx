import InitAdmin from '@/modules/admin/pages/init-admin';
import { getRootControllerGetMetadataQueryOptions } from '@/services/apis/gen/queries';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/init-admin')({
  component: InitAdmin,
  beforeLoad: async ({ context }) => {
    const data = await context.queryClient
      .ensureQueryData(getRootControllerGetMetadataQueryOptions())
      .catch(() => null);
    if (data?.isInit) throw redirect({ to: '/login' });
  },
});
