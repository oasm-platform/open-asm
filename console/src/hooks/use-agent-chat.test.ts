import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentChat } from './use-agent-chat';

const mocks = vi.hoisted(() => ({
  onData: undefined as
    | ((data: { type: string; data: unknown }) => void)
    | undefined,
  orvalClient: vi.fn(),
  status: 'streaming' as string,
  messagesData: undefined as unknown,
  onError: undefined as ((error: Error) => void) | undefined,
  regenerate: vi.fn(),
  refetch: vi.fn(),
  chatMessages: [] as UIMessage[],
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: {
    onData: (data: { type: string; data: unknown }) => void;
    onError: (error: Error) => void;
  }) => {
    mocks.onData = options.onData;
    mocks.onError = options.onError;
    return {
      messages: mocks.chatMessages,
      status: mocks.status,
      sendMessage: vi.fn(),
      setMessages: vi.fn(),
      regenerate: mocks.regenerate,
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
  useLocation: () => ({ state: null, pathname: '/aistudio/conversations/c1' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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
    data: mocks.messagesData,
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: mocks.refetch,
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

describe('useAgentChat run that outlived the stream', () => {
  beforeEach(() => {
    mocks.onData = undefined;
    mocks.orvalClient.mockReset();
    mocks.orvalClient.mockResolvedValue({ id: 'c1' });
    mocks.status = 'ready';
  });
  afterEach(() => {
    mocks.status = 'streaming';
    mocks.messagesData = undefined;
  });

  const page = (running: boolean | undefined, status: string) => ({
    pages: [
      {
        ...(running === undefined ? {} : { running }),
        data: [
          { id: 'a1', role: 'assistant', parts: [], metadata: { status } },
          { id: 'u1', role: 'user', content: 'hi' },
        ],
      },
    ],
  });

  it('reports streaming while the server still writes the answer', () => {
    mocks.messagesData = page(true, 'streaming');
    const { result } = renderHook(() => useAgentChat({ conversationId: 'c1' }));
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.onRetry).toBeUndefined();
  });

  it('falls back to the message status when the server sends no flag', () => {
    mocks.messagesData = page(undefined, 'streaming');
    const { result } = renderHook(() => useAgentChat({ conversationId: 'c1' }));
    expect(result.current.isStreaming).toBe(true);
  });

  it('does not lock the chat on a message a dead run left streaming', () => {
    mocks.messagesData = page(false, 'streaming');
    const { result } = renderHook(() => useAgentChat({ conversationId: 'c1' }));
    expect(result.current.isStreaming).toBe(false);
  });

  it('reports streaming between continuation iterations', () => {
    mocks.messagesData = page(true, 'completed');
    const { result } = renderHook(() => useAgentChat({ conversationId: 'c1' }));
    expect(result.current.isStreaming).toBe(true);
  });

  it('ends a dropped-stream error for good when the run outlived it', async () => {
    vi.useFakeTimers();
    try {
      mocks.regenerate.mockReset();
      mocks.messagesData = page(true, 'streaming');
      const { result, rerender } = renderHook(() =>
        useAgentChat({ conversationId: 'c1' }),
      );

      act(() => {
        mocks.onError?.(new Error('Failed to fetch'));
      });
      // The run is still going: no error, polling shows the answer
      expect(result.current.streamError).toBeNull();

      // The run ends; the old error must not trigger a retry now
      mocks.messagesData = page(false, 'completed');
      rerender();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(mocks.regenerate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('checks fresh data before retrying, and skips the retry if the run lives', async () => {
    vi.useFakeTimers();
    try {
      mocks.regenerate.mockReset();
      // Cached before the send: looks idle
      mocks.messagesData = page(false, 'completed');
      mocks.refetch.mockResolvedValue({
        isError: false,
        error: null,
        data: page(true, 'streaming'),
      });
      renderHook(() => useAgentChat({ conversationId: 'c1' }));

      act(() => {
        mocks.onError?.(new Error('Failed to fetch'));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(mocks.refetch).toHaveBeenCalled();
      expect(mocks.regenerate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      mocks.refetch.mockReset();
    }
  });

  it('retries once fresh data shows the run is over', async () => {
    vi.useFakeTimers();
    try {
      mocks.regenerate.mockReset();
      mocks.regenerate.mockResolvedValue(undefined);
      mocks.messagesData = page(false, 'completed');
      mocks.refetch.mockResolvedValue({
        isError: false,
        error: null,
        data: page(false, 'aborted'),
      });
      renderHook(() => useAgentChat({ conversationId: 'c1' }));

      act(() => {
        mocks.onError?.(new Error('Failed to fetch'));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(mocks.regenerate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      mocks.refetch.mockReset();
    }
  });

  it('does not ask again when the run answered while the stream was down', async () => {
    vi.useFakeTimers();
    try {
      mocks.regenerate.mockReset();
      mocks.chatMessages = [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
        { id: 'a0', role: 'assistant', parts: [{ type: 'text', text: 'par' }] },
      ];
      mocks.messagesData = page(false, 'streaming');
      mocks.refetch.mockResolvedValue({
        isError: false,
        error: null,
        data: page(false, 'completed'),
      });
      const { result } = renderHook(() => useAgentChat({ conversationId: 'c1' }));

      act(() => {
        mocks.onError?.(new Error('Failed to fetch'));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(mocks.regenerate).not.toHaveBeenCalled();
      expect(result.current.streamError).toBeNull();
    } finally {
      vi.useRealTimers();
      mocks.refetch.mockReset();
      mocks.chatMessages = [];
    }
  });

  it('stops showing the retry spinner once retries run out', async () => {
    vi.useFakeTimers();
    try {
      mocks.regenerate.mockReset();
      mocks.messagesData = page(false, 'completed');
      mocks.refetch.mockRejectedValue(new Error('offline'));
      const { result } = renderHook(() => useAgentChat({ conversationId: 'c1' }));

      act(() => {
        mocks.onError?.(new Error('Failed to fetch'));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(mocks.regenerate).not.toHaveBeenCalled();
      expect(result.current.isRetrying).toBe(false);
      expect(result.current.streamError).toBe('Failed to fetch');
    } finally {
      vi.useRealTimers();
      mocks.refetch.mockReset();
    }
  });

  it('is idle once the run is over', () => {
    mocks.messagesData = page(false, 'completed');
    const { result } = renderHook(() => useAgentChat({ conversationId: 'c1' }));
    expect(result.current.isStreaming).toBe(false);
  });
});

describe('useAgentChat conversation stats', () => {
  beforeEach(() => {
    mocks.onData = undefined;
    mocks.orvalClient.mockReset();
  });

  it('loads the metadata with the conversation and updates it after a turn', async () => {
    mocks.orvalClient.mockResolvedValueOnce({
      id: 'c1',
      agentMode: 'ask',
      metadata: { model: 'gpt-5', contextWindow: 400_000 },
    });
    const { result } = renderHook(() => useAgentChat({ conversationId: 'c1' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.conversationMeta).toEqual({
      model: 'gpt-5',
      contextWindow: 400_000,
    });

    const after = { model: 'gpt-5', contextWindow: 400_000, contextUsedTokens: 1_000 };
    act(() => {
      mocks.onData?.({ type: 'data-conversation-stats', data: { metadata: after } });
    });
    expect(result.current.conversationMeta).toEqual(after);
  });
});
