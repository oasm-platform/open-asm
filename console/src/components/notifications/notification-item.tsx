import {
  getNotificationsControllerGetNotificationsInfiniteQueryKey,
  getNotificationsControllerGetUnreadCountQueryKey,
  type Notification,
  type NotificationResponseDto,
  NotificationResponseDtoStatus,
  useNotificationsControllerMarkAsRead,
} from '@/services/apis/gen/queries';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

// Extended notification type that includes content with metadata
interface NotificationWithContent extends Notification {
  content?: {
    metadata?: {
      link?: string;
    };
  };
}
import { CheckCheck, Info } from 'lucide-react';
import { memo, useCallback } from 'react';
import { Link } from 'react-router-dom';

interface NotificationItemProps {
  notification: NotificationResponseDto;
  variant?: 'popup' | 'page';
  onClick?: () => void;
}

export const NotificationItem = memo(function NotificationItem({
  notification,
  variant = 'popup',
  onClick,
}: NotificationItemProps) {
  const queryClient = useQueryClient();
  const markAsRead = useNotificationsControllerMarkAsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getNotificationsControllerGetNotificationsInfiniteQueryKey({
            limit: 10,
          }),
        });
        queryClient.invalidateQueries({
          queryKey: getNotificationsControllerGetUnreadCountQueryKey(),
        });
      },
    },
  });

  const isUnread = notification.status === NotificationResponseDtoStatus.unread;

  const handleClick = useCallback(() => {
    if (isUnread) {
      markAsRead.mutate({ id: notification.id });
    }
    onClick?.();
  }, [isUnread, notification.id, markAsRead, onClick]);

  // Determine link based on notification metadata
  const linkTo =
    (notification.notification as NotificationWithContent)?.content?.metadata
      ?.link || '/';

  return (
    <Link
      to={linkTo}
      onClick={handleClick}
      className={cn(
        'flex items-start gap-4 p-4 transition-colors hover:bg-muted/50',
        isUnread ? 'bg-muted/30' : 'bg-background',
        variant === 'page' && 'border-b',
      )}
    >
      <div className="mt-1">
        <Info className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 space-y-1">
        <p
          className={cn(
            'text-sm leading-none font-medium',
            isUnread
              ? 'font-semibold text-foreground'
              : 'text-muted-foreground',
          )}
        >
          {notification.message || 'New notification'}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{new Date(notification.createdAt).toLocaleString()}</span>
          {notification.status === NotificationResponseDtoStatus.read && (
            <CheckCheck className="h-3 w-3" />
          )}
        </div>
      </div>
      {isUnread && <div className="mt-1 h-2 w-2 rounded-full bg-primary" />}
    </Link>
  );
});
