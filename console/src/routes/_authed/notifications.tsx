import { createFileRoute } from '@tanstack/react-router';
import NotificationsPage from '@/pages/notifications/notifications';

export const Route = createFileRoute('/_authed/notifications')({
  component: () => (
      <NotificationsPage />
  ),
});
