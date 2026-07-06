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
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, MoreVertical, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { memo, useCallback } from 'react';
import { Link } from '@tanstack/react-router';

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

  const deleteNotification = useNotificationsControllerDeleteNotification({
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
        onClose?.();
      },
    },
  });

  const isUnread = notification.status === NotificationResponseDtoStatus.unread;

  const handleClick = useCallback(() => {
    if (isUnread) {
      markAsRead.mutate({ id: notification.id });
    }
    onClose?.();
    onClick?.();
  }, [isUnread, notification.id, markAsRead, onClick, onClose]);

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
        to={notification.url}
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
