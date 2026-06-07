import Register from '@/pages/register/register';
import { getRootControllerGetMetadataQueryOptions } from '@/services/apis/gen/queries';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/init-admin')({
  component: Register,
  beforeLoad: async ({ context }) => {
    const { isInit } = await context.queryClient.fetchQuery(
      getRootControllerGetMetadataQueryOptions(),
    );
    if (isInit) throw redirect({ to: '/' });
  },
});
