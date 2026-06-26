import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import SettingsLayout from '@/components/common/layout/settings-layout';

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
  },
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
});
