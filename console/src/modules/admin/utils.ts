import type { User } from '@/utils/authClient';
import { redirect } from '@tanstack/react-router';

export const ADMIN_ROLE = 'admin';

/** True when the user holds the platform-wide admin role. */
export const isAdminUser = (user: Pick<User, 'role'> | null | undefined) =>
  user?.role === ADMIN_ROLE;

/**
 * Route guard for /admin/*: sends anonymous users to login (returning them
 * to `href` afterwards) and non-admins to the home page.
 */
export function requireAdmin(session: User | null, href: string) {
  if (!session) {
    throw redirect({
      to: '/login',
      search: { redirect: href },
    });
  }
  if (!isAdminUser(session)) {
    throw redirect({ to: '/' });
  }
}
