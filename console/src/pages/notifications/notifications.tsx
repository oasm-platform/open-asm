import { NotificationList } from '@/components/notifications/notification-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getNotificationsControllerGetNotificationsInfiniteQueryKey,
  getNotificationsControllerGetUnreadCountQueryKey,
  useNotificationsControllerGetUnreadCount,
  useNotificationsControllerMarkAllAsRead,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';

export default function NotificationsPage() {
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

  return (
    <div className="container mx-auto max-w-4xl py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6" />
            <div>
              <CardTitle className="text-2xl font-bold">
                Notifications
              </CardTitle>
              {unreadCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  {unreadCount} unread notification
                  {unreadCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending || unreadCount === 0}
              className="flex items-center gap-2"
            >
              {markAllAsRead.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              Mark all as read
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <NotificationList variant="page" />
        </CardContent>
      </Card>
    </div>
  );
}
