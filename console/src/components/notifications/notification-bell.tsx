import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  getNotificationsControllerGetNotificationsInfiniteQueryKey,
  getNotificationsControllerGetUnreadCountQueryKey,
  useNotificationsControllerGetUnreadCount,
  useNotificationsControllerMarkAllAsRead,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useCallback, useState } from 'react';
import { NotificationList } from './notification-list';
import { useNotificationStream } from '@/hooks/use-notification-stream';
import { Link } from 'react-router-dom';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: unreadCountData } = useNotificationsControllerGetUnreadCount();
  const unreadCount = typeof unreadCountData === 'number' ? unreadCountData : 0;
  const markAllAsRead = useNotificationsControllerMarkAllAsRead({
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

  useNotificationStream();

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen);
      if (newOpen && unreadCount > 0) {
        markAllAsRead.mutate();
      }
    },
    [unreadCount, markAllAsRead],
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="sr-only">Toggle notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="font-semibold">Notifications</h4>
          <Button variant="ghost" size="sm" className="justify-between">
            <Link to="/notifications">View all</Link>
          </Button>
        </div>
        <NotificationList />
      </PopoverContent>
    </Popover>
  );
}
