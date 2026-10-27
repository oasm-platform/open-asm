import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedFromSaved, useAgentChat } from './use-agent-chat';

const mocks = vi.hoisted(() => ({
  onData: undefined as
    | ((data: { type: string; data: unknown }) => void)
    | undefined,
  orvalClient: vi.fn(),
  status: 'streaming' as string,
  messagesData: undefined as unknown,
  onError: undefined as ((error: Error) => void) | undefined,
  regenerate: vi.fn(),
  // Fresh history, as the hook refetches it before resuming
  refetch: vi.fn(async (): Promise<unknown> => ({ data: undefined })),
  chatMessages: [] as UIMessage[],
  setMessages: vi.fn(),
  resumeStream: vi.fn(),
  locationState: null as unknown,
  transportOptions: undefined as
    | { fetch: (input: string, init?: RequestInit) => Promise<Response> }
    | undefined,
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: {
    onData: (data: { type: string; data: unknown }) => void;
    onError: (error: Error) => void;
    resume?: boolean;
  }) => {
    // The hook resumes by itself: useChat's own resume (an effect StrictMode
    // runs twice) must stay off
    if (options.resume) throw new Error('useChat resume must stay off');
    mocks.onData = options.onData;
    mocks.onError = options.onError;
    return {
      messages: mocks.chatMessages,
      status: mocks.status,
      sendMessage: vi.fn(),
      setMessages: mocks.setMessages,
      regenerate: mocks.regenerate,
      stop: vi.fn(),
      resumeStream: mocks.resumeStream,
    };
  },
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    DefaultChatTransport: class DefaultChatTransport {
      constructor(options: typeof mocks.transportOptions) {
        mocks.transportOptions = options;
      }
    },
  };
});

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({
    state: mocks.locationState,
    pathname: '/aistudio/conversations/c1',
  }),
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
  SubagentResponseDtoStatus: {
    pending: 'pending',
    in_progress: 'in_progress',
    completed: 'completed',
    failed: 'failed',
  },
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

  it('drops a prompt the server no longer knows about', async () => {
    // A reload replays the answer stream, so an already answered plan prompt
    // can reappear: it can never be decided, and must not block the chat.
    mocks.orvalClient.mockRejectedValueOnce({ response: { status: 404 } });
    const { result } = renderHook(() =>
      useAgentChat({ conversationId: undefined }),
    );

    act(() => {
      mocks.onData?.({
        type: 'data-approval-required',
        data: {
          approvalId: 'stale-1',
          toolCallId: 'tool-1',
          kind: 'plan',
          command: '',
          mode: 'plan',
          plan: ['Enumerate subdomains'],
        },
      });
    });
    expect(result.current.pendingApprovalCount).toBe(1);

    await act(async () => {
      result.current.onDecideApproval('approved', { mode: 'auto' });
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

describe('useAgentChat subagents', () => {
  const subagent = (status: string) => ({ id: 's1', name: 'worker', status });

  beforeEach(() => {
    mocks.onData = undefined;
    mocks.messagesData = undefined;
    mocks.status = 'streaming';
    mocks.orvalClient.mockReset();
  });

  afterEach(() => {
    mocks.status = 'streaming';
  });

  const flush = () =>
    act(async () => {
      await Promise.resolve();
    });

  it('loads them with the conversation and follows stream updates without refetching', async () => {
    mocks.orvalClient.mockResolvedValueOnce({
      id: 'c1',
      subagents: [subagent('pending')],
    });
    const { result } = renderHook(() => useAgentChat({ conversationId: 'c1' }));
    await flush();
    expect(result.current.subagents).toEqual([subagent('pending')]);

    act(() => {
      mocks.onData?.({
        type: 'data-subagents-updated',
        data: { subagents: [subagent('completed')] },
      });
    });
    expect(result.current.subagents).toEqual([subagent('completed')]);
    expect(mocks.orvalClient).toHaveBeenCalledTimes(1);
  });

  it('reloads the detail once when the run ends with a subagent still active', async () => {
    mocks.orvalClient
      .mockResolvedValueOnce({ id: 'c1', subagents: [subagent('in_progress')] })
      .mockResolvedValueOnce({ id: 'c1', subagents: [subagent('completed')] });
    const { result, rerender } = renderHook(() =>
      useAgentChat({ conversationId: 'c1' }),
    );
    await flush();

    mocks.status = 'ready';
    rerender();
    await flush();

    expect(mocks.orvalClient).toHaveBeenCalledTimes(2);
    expect(result.current.subagents).toEqual([subagent('completed')]);
  });

  it('does not reload when no subagent is active at the end of the run', async () => {
    mocks.orvalClient.mockResolvedValueOnce({
      id: 'c1',
      subagents: [subagent('completed')],
    });
    const { rerender } = renderHook(() => useAgentChat({ conversationId: 'c1' }));
    await flush();

    mocks.status = 'ready';
    rerender();
    await flush();

    expect(mocks.orvalClient).toHaveBeenCalledTimes(1);
  });
});

describe('seedFromSaved', () => {
  const msg = (id: string, role: 'user' | 'assistant'): UIMessage =>
    ({ id, role, parts: [] }) as UIMessage;
  const pages = (status: string) => [
    { data: [{ role: 'assistant', metadata: { status } }] },
  ];

  it('drops the trailing assistant while the server is still producing it', () => {
    const saved = [msg('u1', 'user'), msg('a1', 'assistant')];
    expect(seedFromSaved(saved, pages('streaming'))).toEqual([saved[0]]);
  });

  it('keeps every message once the last answer is finished', () => {
    const saved = [msg('u1', 'user'), msg('a1', 'assistant')];
    expect(seedFromSaved(saved, pages('completed'))).toBe(saved);
  });

  it('keeps a trailing user message even mid-stream', () => {
    const saved = [msg('a1', 'assistant'), msg('u2', 'user')];
    expect(seedFromSaved(saved, pages('streaming'))).toBe(saved);
  });
});

describe('useAgentChat stream resume', () => {
  // Newest first, as the server pages them: a run still writing its answer
  const history = (conversationId: string, running: boolean) => ({
    data: {
      pages: [
        {
          running,
          data: [
            {
              id: `${conversationId}-a2`,
              role: 'assistant',
              parts: [{ type: 'text', text: 'partial' }],
              metadata: { status: running ? 'streaming' : 'completed' },
            },
            { id: `${conversationId}-u2`, role: 'user', content: 'scan it' },
          ],
        },
      ],
    },
  });

  const flush = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

  beforeEach(() => {
    mocks.orvalClient.mockReset();
    mocks.orvalClient.mockResolvedValue({ id: 'c1' });
    mocks.resumeStream.mockReset();
    mocks.resumeStream.mockResolvedValue(undefined);
    mocks.setMessages.mockReset();
    mocks.refetch.mockReset();
    mocks.refetch.mockResolvedValue(history('c1', true));
    mocks.status = 'ready';
  });

  afterEach(() => {
    mocks.locationState = null;
    mocks.status = 'streaming';
    mocks.refetch.mockReset();
    vi.unstubAllGlobals();
  });

  it('resumes the run of an existing conversation once, even in StrictMode', async () => {
    // StrictMode runs effects twice; two resumes of one run interleave their
    // writes into duplicate copies of the answer.
    const { rerender } = renderHook(
      () => useAgentChat({ conversationId: 'c1' }),
      { reactStrictMode: true },
    );
    rerender();
    await flush();

    expect(mocks.resumeStream).toHaveBeenCalledTimes(1);
  });

  it('seeds fresh history without the answer the replay rewrites', async () => {
    // The replay continues the newest message when it is an assistant one:
    // seeding the partial answer would show it twice.
    renderHook(() => useAgentChat({ conversationId: 'c1' }));
    await flush();

    expect(mocks.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    const seeded = mocks.setMessages.mock.calls.at(-1)?.[0] as UIMessage[];
    expect(seeded.map((m) => m.id)).toEqual(['c1-u2']);
    expect(mocks.setMessages.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.resumeStream.mock.invocationCallOrder[0],
    );
  });

  it('does not resume a conversation whose run is over', async () => {
    mocks.refetch.mockResolvedValue(history('c1', false));
    renderHook(() => useAgentChat({ conversationId: 'c1' }));
    await flush();

    expect(mocks.resumeStream).not.toHaveBeenCalled();
  });

  it('resumes a running conversation switched to on the same page', async () => {
    // The page stays mounted across conversations, so this is no mount
    mocks.refetch.mockResolvedValue(history('c1', false));
    const { rerender } = renderHook(
      ({ id }) => useAgentChat({ conversationId: id }),
      { initialProps: { id: 'c1' } },
    );
    await flush();
    expect(mocks.resumeStream).not.toHaveBeenCalled();

    mocks.refetch.mockResolvedValue(history('c2', true));
    rerender({ id: 'c2' });
    await flush();
    expect(mocks.resumeStream).toHaveBeenCalledTimes(1);

    // And again on coming back to it while its run goes on
    mocks.refetch.mockResolvedValue(history('c1', false));
    rerender({ id: 'c1' });
    await flush();
    mocks.refetch.mockResolvedValue(history('c2', true));
    rerender({ id: 'c2' });
    await flush();
    expect(mocks.resumeStream).toHaveBeenCalledTimes(2);
  });

  it('does not resume a conversation left before its history came back', async () => {
    let answerC1: (value: unknown) => void = () => undefined;
    mocks.refetch.mockReturnValueOnce(
      new Promise((resolve) => {
        answerC1 = resolve;
      }),
    );
    const { rerender } = renderHook(
      ({ id }) => useAgentChat({ conversationId: id }),
      { initialProps: { id: 'c1' } },
    );
    mocks.refetch.mockResolvedValue(history('c2', false));
    rerender({ id: 'c2' });
    await flush();

    answerC1(history('c1', true));
    await flush();
    expect(mocks.resumeStream).not.toHaveBeenCalled();
  });

  it('drops the streams of a conversation it leaves, without an error', async () => {
    const fetchMock = vi.fn(async () => new Response(null));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ id }) => useAgentChat({ conversationId: id }),
      { initialProps: { id: 'c1' } },
    );
    await flush();

    await mocks.transportOptions!.fetch('/api/agents/conversations/c1/stream');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const signal = init.signal!;
    expect(signal.aborted).toBe(false);

    rerender({ id: 'c2' });
    expect(signal.aborted).toBe(true);

    // A resume cut while connecting reaches onError with the abort reason
    act(() => {
      mocks.onError?.(signal.reason as Error);
    });
    expect(result.current.streamError).toBeNull();
  });

  it('does not resume a chat just started from the landing page', async () => {
    // It has no row on the server yet, so a resume request would 404.
    mocks.locationState = { pendingMessage: 'scan example.com' };
    renderHook(() => useAgentChat({ conversationId: 'c1' }));
    await flush();
    expect(mocks.resumeStream).not.toHaveBeenCalled();
  });

  it('does not resume a new chat after its first answer ends', async () => {
    // Resuming then would replay the finished answer onto the shown copy.
    mocks.locationState = { pendingMessage: 'scan example.com' };
    mocks.status = 'streaming';
    const { rerender } = renderHook(() =>
      useAgentChat({ conversationId: 'c1' }),
    );

    mocks.status = 'ready';
    rerender();
    rerender();
    await flush();

    expect(mocks.resumeStream).not.toHaveBeenCalled();
  });
});
