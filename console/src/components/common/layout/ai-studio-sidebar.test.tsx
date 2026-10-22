import { SidebarProvider } from '@/components/ui/sidebar';
import { renderWithProviders, screen } from '@/test/utils';
import { within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiStudioSidebar } from './ai-studio-sidebar';

const updateMock = vi.fn();
const deleteMock = vi.fn();
const deleteAllMock = vi.fn();
const openSettingsMock = vi.fn();

vi.mock('./menu-bar', () => ({
  AppSidebar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({
    state: { selectedWorkspaceId: 'workspace-1' },
  }),
}));

vi.mock('@/hooks/useAgentSettingsDialog', () => ({
  useAgentSettingsDialog: () => ({ open: openSettingsMock }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/services/apis/gen/queries')
  >();
  return {
    ...actual,
    useAgentsControllerGetConversationsInfinite: () => ({
      data: {
        pages: [
          {
            data: [
              { id: 'c1', title: 'Scan example.com' },
              { id: 'c2', title: null },
            ],
          },
        ],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isLoading: false,
      isFetchingNextPage: false,
    }),
    useAgentsControllerUpdateConversation: () => ({
      mutate: updateMock,
      isPending: false,
    }),
    useAgentsControllerDeleteConversation: () => ({
      mutate: deleteMock,
      isPending: false,
    }),
    useAgentsControllerDeleteAllConversations: () => ({
      mutate: deleteAllMock,
      isPending: false,
    }),
  };
});

function setup() {
  return renderWithProviders(
    <SidebarProvider>
      <AiStudioSidebar />
    </SidebarProvider>,
  );
}

describe('AiStudioSidebar', () => {
  beforeEach(() => {
    updateMock.mockReset();
    deleteMock.mockReset();
    deleteAllMock.mockReset();
    openSettingsMock.mockReset();
  });

  it('opens the agent settings from Settings', async () => {
    const { user } = setup();

    await user.click(await screen.findByRole('button', { name: 'Settings' }));

    expect(openSettingsMock).toHaveBeenCalledWith();
  });

  it('links to the connectors page', async () => {
    setup();

    expect(
      await screen.findByRole('link', { name: 'Connectors' }),
    ).toHaveAttribute('href', '/aistudio/connectors');
  });

  it('links to the usage page', async () => {
    setup();

    expect(await screen.findByRole('link', { name: 'Usage' })).toHaveAttribute(
      'href',
      '/aistudio/usage',
    );
  });

  it('shows Chats as a plain label, not a link', async () => {
    setup();

    expect(await screen.findByText('Chats')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Chats' }),
    ).not.toBeInTheDocument();
  });

  it('deletes every conversation from the Chats menu after confirming', async () => {
    const { user } = setup();

    await user.click(
      await screen.findByRole('button', { name: 'Chats actions' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Delete all' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));

    expect(deleteAllMock).toHaveBeenCalledTimes(1);
  });

  it('renames a conversation inline from its menu', async () => {
    const { user } = setup();

    const [firstActions] = await screen.findAllByRole('button', {
      name: 'Conversation actions',
    });
    await user.click(firstActions);
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const input = await screen.findByRole('textbox', {
      name: 'Conversation title',
    });
    await user.clear(input);
    await user.type(input, 'Recon notes{Enter}');

    expect(updateMock).toHaveBeenCalledWith({
      id: 'c1',
      data: { title: 'Recon notes' },
    });
  });

  it('deletes one conversation from its menu after confirming', async () => {
    const { user } = setup();

    const [, secondActions] = await screen.findAllByRole('button', {
      name: 'Conversation actions',
    });
    await user.click(secondActions);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteMock).toHaveBeenCalledWith({ id: 'c2' }, expect.anything());
  });
});
