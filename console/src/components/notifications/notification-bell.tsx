import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useNotificationsControllerGetUnreadCount,
  useNotificationsControllerMarkAllAsRead,
} from '@/services/apis/gen/queries';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { NotificationList } from './notification-list';
import { useNotificationStream } from '@/hooks/use-notification-stream';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = useNotificationsControllerGetUnreadCount();
  const markAllAsRead = useNotificationsControllerMarkAllAsRead();

  useNotificationStream(); // Activate stream

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen && unreadCount > 0) {
      markAllAsRead.mutate();
    }
  };

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
        </div>
        <NotificationList />
      </PopoverContent>
    </Popover>
  );
}
