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
  beforeLoad: async ({ context, search }) => {
    if (context.session) {
      throw redirect({ to: search.redirect || '/' });
    }

    let metadata;
    try {
      metadata = await context.queryClient.ensureQueryData(
        getRootControllerGetMetadataQueryOptions(),
      );
    } catch {
      return;
    }

    if (metadata && !metadata.isInit) {
      throw redirect({ to: '/init-admin' });
    }
  },
});
