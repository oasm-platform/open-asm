import {
  getNotificationsControllerGetNotificationsInfiniteQueryKey,
  getNotificationsControllerGetUnreadCountQueryKey,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useLiveEvents } from './use-live-events';

export function useNotificationStream() {
  const queryClient = useQueryClient();

  const handleMessage = useCallback(() => {
    // Invalidate queries to refetch
    queryClient.invalidateQueries({
      queryKey: getNotificationsControllerGetNotificationsInfiniteQueryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: getNotificationsControllerGetUnreadCountQueryKey(),
    });
  }, [queryClient]);

  useLiveEvents('notification.*', handleMessage);
}
