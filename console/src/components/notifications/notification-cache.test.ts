import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  getNotificationsControllerGetNotificationsInfiniteQueryKey,
  NotificationResponseDtoStatus,
  type NotificationListResponseDto,
  type NotificationResponseDto,
} from '@/services/apis/gen/queries';
import { patchNotificationPages } from './notification-cache';

const item = (
  id: string,
  status: NotificationResponseDtoStatus,
): NotificationResponseDto => ({
  id,
  status,
  createdAt: '2026-10-28T10:00:00.000Z',
  message: id,
  url: '/',
});

const page = (...ids: string[]): NotificationListResponseDto => ({
  data: ids.map((id) => item(id, NotificationResponseDtoStatus.sent)),
  nextCursor: 'next',
});

const seeded = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    getNotificationsControllerGetNotificationsInfiniteQueryKey({ limit: 20 }),
    { pages: [page('a', 'b'), page('c')], pageParams: [undefined, 'next'] },
  );
  return queryClient;
};

const statuses = (queryClient: QueryClient) => {
  const data = queryClient.getQueryData<{
    pages: NotificationListResponseDto[];
  }>(getNotificationsControllerGetNotificationsInfiniteQueryKey({ limit: 20 }));
  return data?.pages.flatMap((p) => p.data.map((n) => n.status));
};

describe('patchNotificationPages', () => {
  it('patches every loaded cursor page without invalidating the query', () => {
    const queryClient = seeded();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    patchNotificationPages(queryClient, (notifications) =>
      notifications.map((n) => ({
        ...n,
        status: NotificationResponseDtoStatus.read,
      })),
    );

    expect(statuses(queryClient)).toEqual(['read', 'read', 'read']);
    // Invalidation would make TanStack refetch one request per loaded cursor.
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('leaves the cache untouched when there is no loaded page', () => {
    const queryClient = new QueryClient();

    patchNotificationPages(queryClient, (notifications) => notifications);

    expect(
      queryClient.getQueryData(
        getNotificationsControllerGetNotificationsInfiniteQueryKey(),
      ),
    ).toBeUndefined();
  });
});
