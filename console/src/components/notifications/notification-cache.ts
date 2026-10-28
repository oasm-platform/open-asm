import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import {
  getNotificationsControllerGetNotificationsInfiniteQueryKey,
  type NotificationListResponseDto,
  type NotificationResponseDto,
} from '@/services/apis/gen/queries';

/**
 * Patches the already-loaded cursor pages in place. Invalidating the infinite
 * query instead makes TanStack refetch every loaded page (one request per
 * cursor) and drops the reader back to the top of the list.
 *
 * Call this from `onSuccess` only: a failed mutation must leave the UI alone
 * rather than showing a change the server did not accept.
 */
export function patchNotificationPages(
  queryClient: QueryClient,
  update: (data: NotificationResponseDto[]) => NotificationResponseDto[],
) {
  queryClient.setQueriesData<InfiniteData<NotificationListResponseDto>>(
    { queryKey: getNotificationsControllerGetNotificationsInfiniteQueryKey() },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((page) => ({ ...page, data: update(page.data) })),
      },
  );
}
