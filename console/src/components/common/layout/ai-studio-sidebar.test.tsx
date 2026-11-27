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
              { id: 'c1', title: 'Scan example.com', running: true },
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
    useProjectsControllerGetMany: () => ({
      data: {
        data: [
          { id: 'p1', name: 'Acme external', hexColor: '#ff0000' },
          { id: 'p2', name: 'Beta corp', hexColor: '#00ff00' },
        ],
      },
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

  it('links to the usage and connectors pages', async () => {
    setup();

    expect(
      await screen.findByRole('link', { name: 'Connectors' }),
    ).toHaveAttribute('href', '/aistudio/connectors');
    expect(await screen.findByRole('link', { name: 'Usage' })).toHaveAttribute(
      'href',
      '/aistudio/usage',
    );
  });

  it('starts every chat from New Chat, with no Agents entry', async () => {
    setup();

    expect(
      await screen.findByRole('link', { name: 'New Chat' }),
    ).toHaveAttribute('href', '/aistudio');
    expect(
      screen.queryByRole('link', { name: 'Agents' }),
    ).not.toBeInTheDocument();
  });

  it('lists projects, each opening an agent chat in that project', async () => {
    setup();

    expect(await screen.findByText('Projects')).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Acme external' });
    const url = new URL(link.getAttribute('href') ?? '', 'http://localhost');
    expect(url.pathname).toBe('/aistudio');
    expect(url.searchParams.get('projectId')).toBe('p1');
    expect(url.searchParams.get('mode')).toBe('agent');
    expect(
      screen.getByRole('link', { name: 'Beta corp' }),
    ).toBeInTheDocument();
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

  it('shows a spinner only on running conversations, keeping their actions', async () => {
    setup();

    const spinner = await screen.findByRole('status', { name: 'Running' });
    const runningRow = screen
      .getByRole('link', { name: 'Scan example.com' })
      .closest('li') as HTMLElement;
    expect(runningRow).toContainElement(spinner);
    expect(screen.getAllByRole('status', { name: 'Running' })).toHaveLength(1);
    expect(
      within(runningRow).getByRole('button', { name: 'Conversation actions' }),
    ).toBeInTheDocument();
  });

  it('hides the spinner while the running conversation menu is open', async () => {
    const { user } = setup();

    const [firstActions] = await screen.findAllByRole('button', {
      name: 'Conversation actions',
    });
    await user.click(firstActions);

    expect(
      await screen.findByRole('menuitem', { name: 'Rename' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Running' }),
    ).not.toBeInTheDocument();
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
