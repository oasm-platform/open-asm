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
  getNotificationsControllerGetNotificationsInfiniteQueryKey,
  getNotificationsControllerGetUnreadCountQueryKey,
  useNotificationsControllerGetUnreadCount,
  useNotificationsControllerMarkAllAsUnread,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useCallback, useState } from 'react';
import { NotificationList } from './notification-list';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: unreadCountData } = useNotificationsControllerGetUnreadCount();
  const unreadCount = typeof unreadCountData === 'number' ? unreadCountData : 0;
  const markAllAsUnread = useNotificationsControllerMarkAllAsUnread({
    mutation: {
      onSuccess: () => {
        queryClient.refetchQueries({
          queryKey: getNotificationsControllerGetUnreadCountQueryKey(),
        });
        queryClient.refetchQueries({
          queryKey: getNotificationsControllerGetNotificationsInfiniteQueryKey({
            limit: 10,
          }),
        });
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
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h4 className="font-semibold">Notifications</h4>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <NotificationList onClose={() => setOpen(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
