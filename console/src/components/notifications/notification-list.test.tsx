import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationResponseDto } from '@/services/apis/gen/queries';
import { NotificationList } from './notification-list';

const h = vi.hoisted(() => ({
  useInfinite: vi.fn(),
  fetchNextPage: vi.fn(),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useNotificationsControllerGetNotificationsInfinite: h.useInfinite,
}));

vi.mock('./notification-item', () => ({
  NotificationItem: ({ notification }: { notification: NotificationResponseDto }) => (
    <div>{notification.message}</div>
  ),
}));

// jsdom has no IntersectionObserver; this one lets a test scroll the list's
// end into view on demand.
let observers: { callback: IntersectionObserverCallback; target?: Element }[] = [];
class FakeIntersectionObserver {
  private entry: (typeof observers)[number];
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback };
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.target = target;
  }
  disconnect() {
    observers = observers.filter((o) => o !== this.entry);
  }
}

const scrollToEnd = () =>
  act(() => {
    for (const { callback, target } of observers) {
      callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }
  });

const page = (count: number) => ({
  data: Array.from({ length: count }, (_, i) => ({
    id: `n-${i}`,
    status: 'unread',
    createdAt: '2026-10-28T10:00:00.000Z',
    message: `Notification ${i}`,
    url: '/',
  })),
});

const listState = (overrides: Record<string, unknown> = {}) => ({
  data: { pages: [page(20)] },
  fetchNextPage: h.fetchNextPage,
  hasNextPage: true,
  isFetchingNextPage: false,
  isLoading: false,
  ...overrides,
});

describe('NotificationList', () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    h.fetchNextPage.mockClear();
    h.useInfinite.mockReturnValue(listState());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('requests 20 notifications per page', () => {
    render(<NotificationList />);
    expect(h.useInfinite).toHaveBeenCalledWith({ limit: 20 }, expect.anything());
  });

  it('pages by the cursor the previous page returned', () => {
    render(<NotificationList />);
    const { query } = h.useInfinite.mock.calls[0][1];

    expect(query.initialPageParam).toBeUndefined();
    expect(query.getNextPageParam({ data: [], nextCursor: 'abc' })).toBe('abc');
    expect(query.getNextPageParam({ data: [], nextCursor: null })).toBeUndefined();
  });

  it('loads the next page when the end of the list scrolls into view', () => {
    render(<NotificationList />);
    expect(h.fetchNextPage).not.toHaveBeenCalled();

    scrollToEnd();
    expect(h.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('has no load-more button', () => {
    render(<NotificationList />);
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('does not refetch every loaded page when the tab regains focus', () => {
    render(<NotificationList />);
    expect(h.useInfinite.mock.calls[0][1].query.refetchOnWindowFocus).toBe(false);
  });

  it('stops once the last page is loaded', () => {
    h.useInfinite.mockReturnValue(listState({ hasNextPage: false }));
    render(<NotificationList />);

    scrollToEnd();
    expect(h.fetchNextPage).not.toHaveBeenCalled();
  });

  it('does not request a page while the previous one is still loading', () => {
    h.useInfinite.mockReturnValue(listState({ isFetchingNextPage: true }));
    render(<NotificationList />);

    scrollToEnd();
    expect(h.fetchNextPage).not.toHaveBeenCalled();
  });
});
