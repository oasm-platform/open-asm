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
      // Only allow in-app paths as the redirect target — an absolute URL
      // (e.g. http://...) would be parsed as a router path and 404, and a
      // protocol-relative URL ('//host') would be an open redirect.
      const redirectTo =
        search.redirect?.startsWith('/') &&
        !search.redirect.startsWith('//')
          ? search.redirect
          : '/';
      throw redirect({ to: redirectTo });
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
