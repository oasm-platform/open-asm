import {
  NotificationStatus,
  type NotificationRecipient,
} from '@/types/notification';
import { useNotificationsControllerMarkAsRead } from '@/services/apis/gen/queries';
import { CheckCheck, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function NotificationItem({
  notification,
  onClick,
}: {
  notification: NotificationRecipient;
  onClick?: () => void;
}) {
  const markAsRead = useNotificationsControllerMarkAsRead();

  const handleClick = () => {
    if (notification.status === NotificationStatus.SENT) {
      markAsRead.mutate({ id: notification.id });
    }
    onClick?.(); // Call the passed onClick prop if it exists
  };

  const isUnread = notification.status !== NotificationStatus.READED;

  // Determine link based on notification type or metadata
  // For now, defaulting to dashboard or using a metadata field if available
  const linkTo = notification.notification?.content?.metadata?.link || '/';

  return (
    <Link
      to={linkTo}
      onClick={handleClick}
      className={cn(
        'flex items-start gap-4 p-4 transition-colors hover:bg-muted/50',
        isUnread ? 'bg-muted/30' : 'bg-background',
      )}
    >
      <div className="mt-1">
        <Info className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 space-y-1">
        <p
          className={cn(
            'text-sm leading-none font-medium',
            isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
        >
          {notification.message || 'New notification'}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{new Date(notification.createdAt).toLocaleString()}</span>
          {notification.status === NotificationStatus.READED && (
            <CheckCheck className="h-3 w-3" />
          )}
        </div>
      </div>
      {isUnread && (
        <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
      )}
    </Link>
  );
}
