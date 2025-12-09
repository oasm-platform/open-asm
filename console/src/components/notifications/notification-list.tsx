import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificationsControllerGetNotifications } from '@/services/apis/gen/queries';
import { type NotificationRecipient } from '@/types/notification';
import { Loader2 } from 'lucide-react';
import { NotificationItem } from './notification-item';

export function NotificationList() {
  const { data, isLoading } = useNotificationsControllerGetNotifications({ page: 1, limit: 10 });

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Ensure data is treated as correct type since generated types are missing/void
  const notifications = (data as any)?.data || [];

  if (notifications.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No notifications
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="flex flex-col">
        {notifications.map((notification: NotificationRecipient) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </div>
    </ScrollArea>
  );
}
