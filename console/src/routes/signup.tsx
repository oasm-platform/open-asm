import SignUp from '@/pages/signup/signup';
import { getRootControllerGetMetadataQueryOptions } from '@/services/apis/gen/queries';
import { safeRedirectPath } from '@/utils/safe-redirect';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

const signUpSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/signup')({
  validateSearch: signUpSearchSchema,
  component: SignUp,
  beforeLoad: async ({ context, search }) => {
    // Already signed in: land where /login would.
    if (context.session) {
      throw redirect({ to: safeRedirectPath(search.redirect) });
    }

    // Fetched, not read from cache, before the page renders: the persisted
    // metadata can be minutes old and an admin may have just closed sign-up.
    // The page then shows the form or the turned-off notice from the start.
    // The API refuses a closed sign-up either way.
    const metadata = await context.queryClient
      .fetchQuery(getRootControllerGetMetadataQueryOptions())
      .catch(() => null);
    if (metadata && !metadata.isInit) throw redirect({ to: '/init-admin' });
  },
});
