import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useAiChat } from './useAiChat';
import { useAiChatConversation } from './useAiChatPanel';

function setup(config?: Parameters<typeof useAiChat>[0]) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => ({ chat: useAiChat(config), conversation: useAiChatConversation() }),
    { wrapper },
  );
}

describe('useAiChat', () => {
  it('opens the panel on a new chat that starts as the config says', async () => {
    const config = { agentMode: 'agent' as const, text: 'Pentest example.com' };
    const { result } = setup(config);
    const before = result.current.conversation.state.conversationId;

    act(() => result.current.chat.openChat());

    const { conversationId, isNew, start } = result.current.conversation.state;
    await waitFor(() => expect(result.current.chat.isOpen).toBe(true));
    expect(conversationId).not.toBe(before);
    expect(isNew).toBe(true);
    expect(start).toEqual({ conversationId, config });
  });

  it('merges what openChat is given over the hook config', () => {
    const { result } = setup({ agentMode: 'agent', text: 'Pentest a.com' });

    act(() =>
      result.current.chat.openChat({ text: 'Pentest b.com', autoSubmit: false }),
    );

    expect(result.current.conversation.state.start?.config).toEqual({
      agentMode: 'agent',
      text: 'Pentest b.com',
      autoSubmit: false,
    });
  });

  it('only shows the panel on the chat it had without a config', async () => {
    const { result } = setup();
    act(() => result.current.conversation.clearStart());
    const before = result.current.conversation.state.conversationId;

    act(() => result.current.chat.openChat());

    await waitFor(() => expect(result.current.chat.isOpen).toBe(true));
    expect(result.current.conversation.state.conversationId).toBe(before);
    expect(result.current.conversation.state.start).toBeNull();
  });

  it('drops the start config once the panel applied it', () => {
    const { result } = setup({ text: 'hi' });
    act(() => result.current.chat.openChat());

    act(() => result.current.conversation.clearStart());

    expect(result.current.conversation.state.start).toBeNull();
  });
});
