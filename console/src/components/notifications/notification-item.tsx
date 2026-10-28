import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  getNotificationsControllerGetNotificationsInfiniteQueryKey,
  getNotificationsControllerGetUnreadCountQueryKey,
  type NotificationResponseDto,
  NotificationResponseDtoStatus,
  useNotificationsControllerDeleteNotification,
  useNotificationsControllerMarkAsRead,
  useNotificationsControllerMarkAsUnread,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Mail, MoreVertical, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { memo, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { splitNotificationUrl } from './notification-url';

dayjs.extend(relativeTime);

interface NotificationItemProps {
  notification: NotificationResponseDto;
  onClick?: () => void;
  onClose?: () => void;
}

export const NotificationItem = memo(function NotificationItem({
  notification,
  onClick,
  onClose,
}: NotificationItemProps) {
  const queryClient = useQueryClient();
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getNotificationsControllerGetNotificationsInfiniteQueryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: getNotificationsControllerGetUnreadCountQueryKey(),
    });
  }, [queryClient]);

  const markAsRead = useNotificationsControllerMarkAsRead({
    mutation: { onSuccess: refresh },
  });
  const markAsUnread = useNotificationsControllerMarkAsUnread({
    mutation: { onSuccess: refresh },
  });

  const deleteNotification = useNotificationsControllerDeleteNotification({
    mutation: {
      onSuccess: () => {
        refresh();
        onClose?.();
      },
    },
  });

  // `sent` (not yet seen) and `unread` (seen in the bell) both mean the user
  // has not read it. The list can load before opening the bell flips `sent`
  // to `unread`, and the full page never flips it at all.
  const isUnread = notification.status !== NotificationResponseDtoStatus.read;

  const { to, search } = splitNotificationUrl(notification.url);

  const handleClick = useCallback(() => {
    if (isUnread) {
      markAsRead.mutate({ id: notification.id });
    }
    onClose?.();
    onClick?.();
  }, [isUnread, notification.id, markAsRead, onClick, onClose]);

  const handleToggleRead = useCallback(() => {
    (isUnread ? markAsRead : markAsUnread).mutate({ id: notification.id });
  }, [isUnread, notification.id, markAsRead, markAsUnread]);

  const handleDelete = useCallback(() => {
    deleteNotification.mutate({ id: notification.id });
  }, [notification.id, deleteNotification]);

  return (
    <div
      className={cn(
        'flex items-start gap-4 p-4 transition-colors hover:bg-muted/50',
        isUnread ? 'bg-muted/30' : 'bg-background',
      )}
    >
      <Link
        to={to}
        search={search}
        onClick={handleClick}
        className="flex-1 space-y-1"
      >
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
          <span>{dayjs(notification.createdAt).fromNow()}</span>
          {notification.status === NotificationResponseDtoStatus.read && (
            <CheckCheck className="h-3 w-3" />
          )}
        </div>
      </Link>
      <div className="flex items-center gap-2">
        {isUnread && <div className="h-2 w-2 rounded-full bg-primary" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={handleToggleRead}>
              {isUnread ? (
                <CheckCheck className="h-4 w-4" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {isUnread ? 'Mark as read' : 'Mark as unread'}
            </DropdownMenuItem>
            <ConfirmDialog
              title="Delete notification"
              description="Are you sure you want to delete this notification? This action cannot be undone."
              onConfirm={handleDelete}
              confirmText="Delete"
              trigger={
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => e.preventDefault()}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
