import { NotificationList } from '@/components/notifications/notification-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNotificationsControllerMarkAllAsRead } from '@/services/apis/gen/queries';
import { CheckCheck } from 'lucide-react';

export default function NotificationsPage() {
  const markAllAsRead = useNotificationsControllerMarkAllAsRead();

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-2xl font-bold">Notifications</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsRead.mutate()}
            className="flex items-center gap-2"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        </CardHeader>
        <CardContent>
          {/* Reusing NotificationList but we might want a full page version later. 
              For now, the list component has a fixed height ScrollArea which might need adjustment 
              if we want it to fill the page, but it's a good start. */}
          <NotificationList />
        </CardContent>
      </Card>
    </div>
  );
}
