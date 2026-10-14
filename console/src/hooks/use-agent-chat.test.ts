import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentChat } from './use-agent-chat';

const mocks = vi.hoisted(() => ({
  onData: undefined as
    | ((data: { type: string; data: unknown }) => void)
    | undefined,
  orvalClient: vi.fn(),
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { onData: (data: { type: string; data: unknown }) => void }) => {
    mocks.onData = options.onData;
    return {
      messages: [] as UIMessage[],
      status: 'streaming',
      sendMessage: vi.fn(),
      setMessages: vi.fn(),
      regenerate: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    DefaultChatTransport: class DefaultChatTransport {},
  };
});

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ state: null, pathname: '/agents/conversations/c1' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/hooks/use-llm-configs', () => ({
  useLLMConfigs: () => ({ preferredProvider: null }),
}));

vi.mock('@/hooks/use-remote-execute-stream', () => ({
  useRemoteExecuteStream: () => ({ appendEvent: vi.fn(), eventsMap: new Map() }),
}));

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'w1' } }),
}));

vi.mock('@/services/apis/gen/queries', () => ({
  useAgentsControllerGetMessagesInfinite: () => ({
    data: undefined,
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock('@/services/apis/axios-client', () => ({
  orvalClient: mocks.orvalClient,
}));

describe('useAgentChat approvals', () => {
  beforeEach(() => {
    mocks.onData = undefined;
    mocks.orvalClient.mockReset();
  });

  it('keeps the approval visible when submitting the decision fails', async () => {
    mocks.orvalClient.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useAgentChat({ conversationId: undefined }));
    const approval = {
      approvalId: 'approval-1',
      toolCallId: 'tool-1',
      command: 'nmap example.com',
      mode: 'manual',
    };

    act(() => {
      mocks.onData?.({ type: 'data-approval-required', data: approval });
    });
    expect(result.current.pendingApproval).toEqual(approval);

    await act(async () => {
      result.current.onDecideApproval('approved');
      await Promise.resolve();
    });

    expect(result.current.pendingApproval).toEqual(approval);
    expect(result.current.isDecidingApproval).toBe(false);

    mocks.orvalClient.mockResolvedValueOnce({});
    await act(async () => {
      result.current.onDecideApproval('approved');
      await Promise.resolve();
    });

    expect(result.current.pendingApproval).toBeNull();
    expect(result.current.streamError).toBeNull();
  });

  it('drops prompts the server answered another way', () => {
    const { result } = renderHook(() => useAgentChat({ conversationId: undefined }));
    const prompt = (approvalId: string) => ({
      approvalId,
      toolCallId: approvalId,
      command: 'fetch_page {}',
      mode: 'manual',
    });

    act(() => {
      mocks.onData?.({ type: 'data-approval-required', data: prompt('a1') });
      mocks.onData?.({ type: 'data-approval-required', data: prompt('a2') });
    });
    expect(result.current.pendingApprovalCount).toBe(2);

    // "allow tool" on a1 also approved the queued a2
    act(() => {
      mocks.onData?.({ type: 'data-approval-resolved', data: { approvalId: 'a2' } });
    });
    expect(result.current.pendingApprovalCount).toBe(1);
    expect(result.current.pendingApproval?.approvalId).toBe('a1');
  });
});
