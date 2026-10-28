import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useNotificationStream } from '@/hooks/use-notification-stream';
import {
  getNotificationsControllerGetUnreadCountQueryKey,
  NotificationResponseDtoStatus,
  useNotificationsControllerGetUnreadCount,
  useNotificationsControllerMarkAllAsRead,
  useNotificationsControllerMarkAllAsUnread,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { patchNotificationPages } from './notification-cache';
import { NotificationList } from './notification-list';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: unreadCountData } = useNotificationsControllerGetUnreadCount();
  const unreadCount = typeof unreadCountData === 'number' ? unreadCountData : 0;
  // Opening the bell demotes not-yet-seen ('sent') items to 'unread' so they
  // get their dot back. The badge counts 'sent' only, so it drops to zero.
  const markAllAsUnread = useNotificationsControllerMarkAllAsUnread({
    mutation: {
      onSuccess: () => {
        patchNotificationPages(queryClient, (notifications) =>
          notifications.map((notification) =>
            notification.status === NotificationResponseDtoStatus.sent
              ? {
                  ...notification,
                  status: NotificationResponseDtoStatus.unread,
                }
              : notification,
          ),
        );
        queryClient.setQueryData(
          getNotificationsControllerGetUnreadCountQueryKey(),
          0,
        );
      },
    },
  });

  const markAllAsRead = useNotificationsControllerMarkAllAsRead({
    mutation: {
      onSuccess: () => {
        patchNotificationPages(queryClient, (notifications) =>
          notifications.map((notification) => ({
            ...notification,
            status: NotificationResponseDtoStatus.read,
          })),
        );
        queryClient.setQueryData(
          getNotificationsControllerGetUnreadCountQueryKey(),
          0,
        );
      },
    },
  });

  useNotificationStream();

  const handleOpen = useCallback(() => {
    setOpen(true);
    if (unreadCount > 0) {
      markAllAsUnread.mutate();
    }
  }, [unreadCount, markAllAsUnread]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="scale-95 rounded-full"
        onClick={handleOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <span className="sr-only">Toggle notifications</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className={cn(
            'flex flex-col w-full sm:w-[calc(100%-2rem)] max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl',
            'shadow-xl p-0',
            'inset-y-0 right-0 fixed',
          )}
        >
          <SheetTitle className="sr-only">Notifications</SheetTitle>
          <SheetDescription className="sr-only">
            Notification panel
          </SheetDescription>
          {/* pr-12 leaves room for the sheet's absolutely-positioned close button. */}
          <div className="flex items-center justify-between border-b py-3 pl-4 pr-12">
            <h4 className="font-semibold">Notifications</h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
            >
              {markAllAsRead.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Mark all as read
            </Button>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <NotificationList onClose={() => setOpen(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
