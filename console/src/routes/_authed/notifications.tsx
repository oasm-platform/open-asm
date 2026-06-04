import { createFileRoute } from '@tanstack/react-router';
import NotificationsPage from '@/pages/notifications/notifications';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/notifications')({
  component: () => (
    <RequireWorkspace>
      <NotificationsPage />
    </RequireWorkspace>
  ),
});
