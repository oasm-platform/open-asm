import { createFileRoute, redirect, Outlet } from '@tanstack/react-router';
import SettingsLayout from '@/components/common/layout/settings-layout';
import { sessionQueryOptions } from '@/utils/authClient';

export const Route = createFileRoute('/settings')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient
      .ensureQueryData(sessionQueryOptions)
      .catch(() => null);
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
});
