import Login from '@/pages/login/login';
import { getRootControllerGetMetadataQueryOptions } from '@/services/apis/gen/queries';
import { isVoluntaryLogout } from '@/utils/authClient';
import { safeRedirectPath } from '@/utils/safe-redirect';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  // Set by the email verification link (utils/verification-url.ts); `error`
  // is better-auth's code for an invalid or expired link
  verified: z.coerce.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: Login,
  beforeLoad: async ({ context, search }) => {
    // During voluntary logout the session may still be in the router context for a few hundred ms — bouncing to the redirect target then would flash dashboard pages before teardown completes.
    if (context.session && !isVoluntaryLogout) {
      throw redirect({ to: safeRedirectPath(search.redirect) });
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
