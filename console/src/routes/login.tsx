import Login from '@/pages/login/login';
import { getRootControllerGetMetadataQueryOptions } from '@/services/apis/gen/queries';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: Login,
  beforeLoad: async ({ context }) => {
    const { isInit } = await context.queryClient.fetchQuery(
      getRootControllerGetMetadataQueryOptions(),
    );
    if (!isInit) throw redirect({ to: '/init-admin' });
  },
});
