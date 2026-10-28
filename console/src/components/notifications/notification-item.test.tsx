import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type NotificationResponseDto,
  NotificationResponseDtoStatus,
} from '@/services/apis/gen/queries';
import { NotificationItem } from './notification-item';

const h = vi.hoisted(() => ({ markAsRead: vi.fn(), markAsUnread: vi.fn() }));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useNotificationsControllerMarkAsRead: () => ({ mutate: h.markAsRead }),
  useNotificationsControllerMarkAsUnread: () => ({ mutate: h.markAsUnread }),
  useNotificationsControllerDeleteNotification: () => ({ mutate: vi.fn() }),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    onClick,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href="#" onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

const notification = (
  status: NotificationResponseDtoStatus,
): NotificationResponseDto => ({
  id: 'n-1',
  status,
  createdAt: '2026-10-28T10:00:00.000Z',
  message: 'New assets discovered for scanme.sh: 1 host',
  url: '/targets/t-1/inventory?isNew=true',
});

function renderItem(status: NotificationResponseDtoStatus) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationItem notification={notification(status)} />
    </QueryClientProvider>,
  );
}

const unreadDot = (container: HTMLElement) =>
  container.querySelector('.rounded-full.bg-primary');

describe('NotificationItem', () => {
  beforeEach(() => {
    h.markAsRead.mockClear();
    h.markAsUnread.mockClear();
  });

  const openMenu = async (container: HTMLElement) => {
    const trigger = container.querySelector('button');
    if (!trigger) throw new Error('menu trigger not rendered');
    await userEvent.click(trigger);
  };

  // A notification pushed in realtime is still `sent` when the list fetches
  // it: opening the bell races the request that flips it to `unread`.
  it.each([NotificationResponseDtoStatus.sent, NotificationResponseDtoStatus.unread])(
    'marks a %s notification as unread',
    (status) => {
      const { container } = renderItem(status);
      expect(unreadDot(container)).not.toBeNull();
    },
  );

  it('shows no unread dot once read', () => {
    const { container } = renderItem(NotificationResponseDtoStatus.read);
    expect(unreadDot(container)).toBeNull();
  });

  it.each([NotificationResponseDtoStatus.sent, NotificationResponseDtoStatus.unread])(
    'marks a %s notification read on click',
    async (status) => {
      renderItem(status);
      await userEvent.click(screen.getByText(/New assets discovered/));
      expect(h.markAsRead).toHaveBeenCalledWith({ id: 'n-1' });
    },
  );

  it('does not re-mark a read notification', async () => {
    renderItem(NotificationResponseDtoStatus.read);
    await userEvent.click(screen.getByText(/New assets discovered/));
    expect(h.markAsRead).not.toHaveBeenCalled();
  });

  it('offers to mark an unread notification as read from its menu', async () => {
    const { container } = renderItem(NotificationResponseDtoStatus.unread);
    await openMenu(container);
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Mark as read' }),
    );
    expect(h.markAsRead).toHaveBeenCalledWith({ id: 'n-1' });
    expect(h.markAsUnread).not.toHaveBeenCalled();
  });

  it('offers to mark a read notification as unread from its menu', async () => {
    const { container } = renderItem(NotificationResponseDtoStatus.read);
    await openMenu(container);
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Mark as unread' }),
    );
    expect(h.markAsUnread).toHaveBeenCalledWith({ id: 'n-1' });
    expect(h.markAsRead).not.toHaveBeenCalled();
  });
});
