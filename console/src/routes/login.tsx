import Login from '@/pages/login/login';
import { getRootControllerGetMetadataQueryOptions } from '@/services/apis/gen/queries';
import { sessionQueryOptions } from '@/utils/authClient';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: Login,
  beforeLoad: async ({ context }) => {
    const metadata = await context.queryClient
      .ensureQueryData(getRootControllerGetMetadataQueryOptions())
      .catch(() => null);

    if (!metadata?.isInit) {
      throw redirect({ to: '/init-admin' });
    }

    const session = await context.queryClient
      .ensureQueryData(sessionQueryOptions)
      .catch(() => null);

    if (session) {
      throw redirect({ to: '/' });
    }
  },
});
