import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  type NotificationResponseDto,
  useNotificationsControllerGetNotificationsInfinite,
} from '@/services/apis/gen/queries';
import { Loader2 } from 'lucide-react';
import { NotificationItem } from './notification-item';

interface NotificationListProps {
  variant?: 'popup' | 'page';
}

export function NotificationList({ variant = 'popup' }: NotificationListProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useNotificationsControllerGetNotificationsInfinite(
      { limit: 10 },
      {
        query: {
          getNextPageParam: (lastGroup) =>
            lastGroup.hasNextPage ? lastGroup.page + 1 : undefined,
          initialPageParam: 1,
        },
      },
    );

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Flatten all pages
  const notifications = data?.pages.flatMap((page) => page.data) ?? [];

  if (notifications.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No notifications
      </div>
    );
  }

  const content = (
    <div className="flex flex-col">
      {notifications.map((notification: NotificationResponseDto) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          variant={variant}
        />
      ))}
      {hasNextPage && (
        <div className="flex justify-center p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}
    </div>
  );

  if (variant === 'page') {
    return content;
  }

  return <ScrollArea className="h-[400px]">{content}</ScrollArea>;
}
