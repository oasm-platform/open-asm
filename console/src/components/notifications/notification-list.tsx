import {
  type NotificationResponseDto,
  useNotificationsControllerGetNotificationsInfinite,
} from '@/services/apis/gen/queries';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NotificationItem } from './notification-item';

const PAGE_SIZE = 20;

interface NotificationListProps {
  onClose?: () => void;
}

export function NotificationList({ onClose }: NotificationListProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useNotificationsControllerGetNotificationsInfinite(
      { limit: PAGE_SIZE },
      {
        query: {
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
          initialPageParam: undefined,
          // A focus refetch re-walks every loaded cursor at once, so tabbing
          // back to the console would fire N page requests. New notifications
          // already arrive through useNotificationStream.
          refetchOnWindowFocus: false,
        },
      },
    );

  // Loads the next page once the end of the list scrolls into view. No root:
  // the observer is clipped by whichever ancestor scrolls (the bell's
  // ScrollArea, or the page itself). Re-observing after each page lands fires
  // again right away if the end is still visible, so a tall screen fills up.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage();
      },
      { rootMargin: '0px 0px 200px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, data]);

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

  return (
    <div className="flex flex-col">
      {notifications.map((notification: NotificationResponseDto) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onClose={onClose}
        />
      ))}
      <div ref={sentinelRef} aria-hidden />
      {isFetchingNextPage && (
        <div className="flex justify-center p-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
