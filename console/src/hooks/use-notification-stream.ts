import {
  getNotificationsControllerGetNotificationsInfiniteQueryKey,
  getNotificationsControllerGetUnreadCountQueryKey,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSse } from './use-sse';

export function useNotificationStream() {
  const queryClient = useQueryClient();

  const handleMessage = useCallback(() => {
    // Invalidate queries to refetch
    queryClient.invalidateQueries({
      queryKey: getNotificationsControllerGetNotificationsInfiniteQueryKey({
        limit: 10,
      }),
    });
    queryClient.invalidateQueries({
      queryKey: getNotificationsControllerGetUnreadCountQueryKey(),
    });
  }, [queryClient]);

  useSse('/api/notifications/stream', handleMessage);
}
