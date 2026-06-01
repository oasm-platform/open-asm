import { createFileRoute, redirect, Outlet } from '@tanstack/react-router';
import SettingsLayout from '@/components/common/layout/settings-layout';
import { authClient } from '@/utils/authClient';

export const Route = createFileRoute('/_authed/settings')({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session?.data) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
});
