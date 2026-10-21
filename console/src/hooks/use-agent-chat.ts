import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import type { AgentTodoItem } from '@/pages/agents/components/agent-todo-panel';
import { isSubagentActive } from '@/pages/agents/components/subagents-panel';
import { useLLMConfigs } from '@/hooks/use-llm-configs';
import {
  agentsControllerStopConversation,
  useAgentsControllerGetMessagesInfinite,
  type ConversationMetadataDto,
  type ConversationResponseDto,
  type SubagentResponseDto,
} from '@/services/apis/gen/queries';
import { orvalClient } from '@/services/apis/axios-client';
import {
  getApprovalMode,
  getApprovalModeVersion,
  isApprovalMode,
  restoreApprovalMode,
  syncApprovalMode,
} from '@/hooks/use-approval-mode';
import { useRemoteExecuteStream } from '@/hooks/use-remote-execute-stream';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Auto-retry constants and helpers
// ---------------------------------------------------------------------------

const MAX_AUTO_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

/** 404: the approval is gone, so the prompt can never be decided. */
function isGoneApprovalError(error: unknown): boolean {
  return (
    (error as { response?: { status?: number } } | null)?.response?.status === 404
  );
}

/**
 * Determines whether a streaming error is transient and worth retrying
 * automatically. Permanent errors (auth, validation) should surface immediately.
 */
function isTransientError(error: Error): boolean {
  const msg = (error.message ?? '').toLowerCase();

  // Network-level failures
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed') ||
    msg.includes('ERR_NETWORK') ||
    msg.includes('ERR_CONNECTION')
  ) {
    return true;
  }

  // Abort from chunkMs timeout (stream stuck) — retryable
  if (msg.includes('timeout') || msg.includes('aborted')) {
    // Distinguish user-initiated abort (not retryable) from system abort (retryable).
    // The user abort typically comes from the stop() action which has a specific message.
    if (msg.includes('user') || msg.includes('stop')) return false;
    return true;
  }

  // Server-side transient errors
  if (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('internal server error') ||
    msg.includes('bad gateway') ||
    msg.includes('service unavailable') ||
    msg.includes('gateway timeout')
  ) {
    return true;
  }

  // Rate limiting
  if (msg.includes('429') || msg.includes('rate limit')) {
    return true;
  }

  return false;
}

/**
 * Why this page dropped its streams of a conversation: the user left it. An
 * abort, so the SDK ends that chat's stream quietly; the run goes on on the
 * server and is resumed when the user comes back.
 */
class LeftConversationError extends Error {
  constructor() {
    super('Left the conversation');
    this.name = 'AbortError';
  }
}

import { useLocation, useNavigate } from '@tanstack/react-router';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';

export interface ApprovalDecisionOptions {
  /** Approve everything else in this conversation too */
  allowConversation?: boolean;
  /** Approve every later call of this tool in this conversation, any input */
  allowTool?: boolean;
  /** Plan approvals: run the plan without asking (auto) or per command (manual) */
  mode?: PlanRunMode;
  /** What the agent should do instead (rejections) */
  feedback?: string;
}

/** How an approved plan runs */
export type PlanRunMode = 'auto' | 'manual';

export interface ApprovalToolMetadata {
  source?: string;
  server?: string;
  name?: string;
  title?: string;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface PendingApproval {
  approvalId: string;
  toolCallId: string;
  /** `plan`: approve a whole plan and pick how it runs */
  kind?: 'plan';
  command: string;
  mode: string;
  tool?: string;
  description?: string;
  toolMetadata?: ApprovalToolMetadata;
  input?: unknown;
  /** The steps of the plan under review (`kind: 'plan'` only) */
  plan?: string[];
}

interface SelectedModel {
  provider: string;
  model: string;
  configId: string;
}

interface UseAgentChatOptions {
  conversationId: string | undefined;
}

interface UseAgentChatReturn {
  messages: UIMessage[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  streamError: string | null;
  isRetrying: boolean;
  retryAttempt: number;
  title: string | null;
  createdAt: string | null;
  todos: AgentTodoItem[];
  /** Goal of the current plan, pinned above its todo list */
  goal: string | null;
  /** Model, context usage and token/cost stats of the conversation */
  conversationMeta: ConversationMetadataDto | null;
  /** Background subagents: from the detail, then from stream updates */
  subagents: SubagentResponseDto[];
  selectedModel: SelectedModel | null;
  agentMode: string;
  selectedWorkerId: string | null;
  hasSentFirstMessage: boolean;
  hasMoreMessages: boolean;
  isLoadingMoreMessages: boolean;
  remoteExecuteEvents: Map<
    string,
    import('@/hooks/use-remote-execute-stream').RemoteExecuteStreamEvent[]
  >;
  onSendMessage: (content: string, options?: { agentMode?: string }) => void;
  onRetry: (() => void) | undefined;
  onStop: () => void;
  onSelectModel: (provider: string, model: string, configId: string) => void;
  onDismissError: () => void;
  onLoadMore: (() => void) | undefined;
  onWorkerSelect: (workerId: string | null) => void;
  pendingApproval: PendingApproval | null;
  pendingApprovalCount: number;
  isDecidingApproval: boolean;
  onDecideApproval: (
    status: 'approved' | 'rejected',
    options?: ApprovalDecisionOptions,
  ) => void;
}

/**
 * Converts DB messages (with messageType) to UIMessage format.
 *
 * If the message has a stored `parts` array (new format), it is used directly —
 * this preserves the real chronological order from the AI stream (thought →
 * tool call → text → thought → …).
 *
 * Otherwise falls back to reconstructing parts from content/messageType/toolCalls
 * (legacy format for old messages).
 */
/** Poll interval while the server is still producing the last answer. */
const SERVER_STREAM_POLL_MS = 1_500;

/**
 * True when the newest message persisted on the server is an assistant turn
 * still being generated. A run outlives the request that started it, so a
 * client that reloads or returns to the conversation sees this and polls until
 * the answer is complete.
 */
function isServerStreaming(
  pages: Array<{ data?: unknown[] } | unknown[]> | undefined,
): boolean {
  if (!pages) return false;
  // Page 1 is newest-first (sortOrder DESC), so the first item is the latest
  const first = pages[0];
  const list = Array.isArray(first)
    ? first
    : ((first as { data?: unknown[] })?.data ?? []);
  const latest = list[0] as Record<string, unknown> | undefined;
  if (!latest || String(latest.role).toLowerCase() !== 'assistant')
    return false;
  const status = (latest.metadata as { status?: string } | undefined)?.status;
  return status === 'streaming';
}

/**
 * True while the server still runs this conversation. The server's `running`
 * flag decides: it also covers the gaps between continuation iterations, and
 * a message left 'streaming' by a crash must not lock the conversation. The
 * newest message's status is only the fallback for a server without it.
 */
function isServerRunning(
  pages: Array<{ data?: unknown[] } | unknown[]> | undefined,
): boolean {
  const running = (pages?.[0] as { running?: unknown } | undefined)?.running;
  return typeof running === 'boolean' ? running : isServerStreaming(pages);
}

/** Text of the newest user message */
function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    return m.parts
      .filter((p) => p.type === 'text')
      .map((p) => ('text' in p ? p.text : ''))
      .join('');
  }
  return '';
}

/**
 * True when the server holds an answer to `question`: the newest message is
 * an assistant answer that did not fail or stop, after a user message with
 * that text. A request that never reached the server leaves the previous
 * turn newest instead, which does not match.
 */
function isAnsweredOnServer(
  pages: Array<{ data?: unknown[] } | unknown[]> | undefined,
  question: string,
): boolean {
  const first = pages?.[0];
  const list = (
    Array.isArray(first) ? first : ((first as { data?: unknown[] })?.data ?? [])
  ) as Array<Record<string, unknown>>;
  const [latest] = list;
  if (!latest || String(latest.role).toLowerCase() !== 'assistant') {
    return false;
  }
  const status = (latest.metadata as { status?: string } | undefined)?.status;
  if (status === 'error' || status === 'aborted' || status === 'streaming') {
    return false;
  }
  const user = list.find((m) => String(m.role).toLowerCase() === 'user');
  return !!question && String(user?.content ?? '') === question;
}

function partSignature(part: UIMessage['parts'][number]): string {
  const p = part as { type: string; state?: string; text?: unknown };
  const state = p.state ? `/${p.state}` : '';
  const length = typeof p.text === 'string' ? `#${p.text.length}` : '';
  return `${p.type}${state}${length}`;
}

/**
 * Cheap identity of a message list: id + type/state/text length of each part.
 * Changes when a message is added or a running message grows (more parts,
 * longer text, a tool finishing), so the history sync updates then but not
 * on every equal refetch.
 */
function messagesSignature(messages: UIMessage[]): string {
  return messages
    .map((m) => `${m.id}:${(m.parts ?? []).map(partSignature).join(',')}`)
    .join('|');
}

/**
 * What to seed useChat with: the saved messages, minus a trailing assistant
 * that the server is still producing. Resuming replays that message from the
 * start, so seeding the database copy would show it twice.
 */
export function seedFromSaved(
  savedMessages: UIMessage[],
  pages: Array<{ data?: unknown[] } | unknown[]> | undefined,
): UIMessage[] {
  const trailingInProgress =
    isServerStreaming(pages) && savedMessages.at(-1)?.role === 'assistant';
  return trailingInProgress ? savedMessages.slice(0, -1) : savedMessages;
}

function mapDbMessagesToUI(
  pages: Array<
    { data?: unknown[]; items?: unknown[]; messages?: unknown[] } | unknown[]
  >,
): UIMessage[] {
  const dataArray = pages
    .flatMap((p) => {
      if (Array.isArray(p)) return p;
      const pageData = p as Record<string, unknown>;
      return (pageData?.data ??
        pageData?.items ??
        pageData?.messages ??
        []) as unknown[];
    })
    .reverse();

  if (dataArray.length === 0) return [];

  const result: UIMessage[] = dataArray.map((msg) => {
    const m = msg as Record<string, unknown>;
    const msgId = String(m.id ?? '');
    const role = String(m.role ?? 'user').toLowerCase() as 'user' | 'assistant';

    // New format: use stored parts array directly
    const storedParts = m.parts as Record<string, unknown>[] | undefined;
    if (Array.isArray(storedParts) && storedParts.length > 0) {
      return {
        id: msgId,
        role,
        parts: storedParts as UIMessage['parts'],
        createdAt: m.createdAt ? new Date(String(m.createdAt)) : new Date(),
      };
    }

    // Legacy format: reconstruct parts from separate fields
    const parts: UIMessage['parts'] = [];
    const content = String(m.content ?? '');
    const messageType = String(m.messageType ?? 'text');

    if (messageType === 'thinking' && content) {
      parts.push({ type: 'reasoning' as const, text: content });
    }

    const toolCalls = m.toolCalls as
      | Array<{
          toolCallId: string;
          toolName: string;
          args: Record<string, unknown>;
          result: Record<string, unknown> | null;
          isError?: boolean;
        }>
      | undefined;
    if (toolCalls && Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        parts.push({
          type: 'dynamic-tool' as const,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          state: tc.isError ? 'output-error' : 'output-available',
          input: tc.args,
          output: tc.result ?? null,
        } as UIMessage['parts'][number]);
      }
    }

    if (messageType === 'text' && content) {
      parts.push({ type: 'text' as const, text: content });
    }

    return {
      id: msgId,
      role,
      parts,
      createdAt: m.createdAt ? new Date(String(m.createdAt)) : new Date(),
    };
  });

  // Remove legacy THINKING-only messages whose reasoning is already captured
  // in the next assistant message's parts (prevents duplicate reasoning display).
  for (let i = 0; i < result.length; i++) {
    const msg = result[i];
    if (msg.role !== 'assistant') continue;
    const hasOnlyReasoning =
      msg.parts.length === 1 && msg.parts[0]?.type === 'reasoning';
    if (!hasOnlyReasoning) continue;
    const nextMsg = result[i + 1];
    if (
      nextMsg?.role === 'assistant' &&
      nextMsg.parts.some((p) => p.type === 'reasoning')
    ) {
      result.splice(i, 1);
      i--;
    }
  }

  return result;
}

export function useAgentChat({
  conversationId,
}: UseAgentChatOptions): UseAgentChatReturn {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasAutoSentRef = useRef(false);
  const chatMessagesRef = useRef<UIMessage[]>([]);
  const isStreamingRef = useRef(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryCountRef = useRef(0);
  const abortRetryRef = useRef<AbortController | null>(null);
  const isUserStoppedRef = useRef(false);
  const [todos, setTodos] = useState<AgentTodoItem[]>([]);
  const [goal, setGoal] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [conversationMeta, setConversationMeta] =
    useState<ConversationMetadataDto | null>(null);
  const [subagents, setSubagents] = useState<SubagentResponseDto[]>([]);
  const subagentsRef = useRef(subagents);
  useEffect(() => {
    subagentsRef.current = subagents;
  }, [subagents]);
  const { appendEvent, eventsMap } = useRemoteExecuteStream();
  // Parallel tool calls can each need approval, so keep a queue
  const [approvalQueue, setApprovalQueue] = useState<PendingApproval[]>([]);
  const pendingApproval = approvalQueue[0] ?? null;
  const [isDecidingApproval, setIsDecidingApproval] = useState(false);
  const { preferredProvider } = useLLMConfigs();
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(
    null,
  );
  const selectedModelRef = useRef<SelectedModel | null>(selectedModel);
  const hasUserSelectedModel = useRef(false);

  // Populate selectedModel from preferredProvider once it loads, unless user
  // has already made an explicit selection.
  useEffect(() => {
    if (hasUserSelectedModel.current || !preferredProvider?.configId) return;
    const model = {
      provider: preferredProvider.providerId,
      model: preferredProvider.model ?? '',
      configId: preferredProvider.configId,
    };
    setSelectedModel(model);
    selectedModelRef.current = model;
  }, [preferredProvider]);
  const [agentMode, setAgentMode] = useState('ask');
  const agentModeRef = useRef('ask');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  // Keep refs in sync
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);
  useEffect(() => {
    agentModeRef.current = agentMode;
  }, [agentMode]);

  // A chat started from the landing page gets its id on the client and only
  // exists on the server once its first message streams. It has no history
  // to load, and fetching it early just 404s (and retries), so skip that.
  const [createdHereId, setCreatedHereId] = useState(() =>
    (location.state as { pendingMessage?: string } | null)?.pendingMessage
      ? conversationId
      : undefined,
  );
  // Kept after createdHereId is cleared: the chat was still started here
  const startedHereIdRef = useRef(createdHereId);
  // Once the user switches to another conversation the new one exists on the
  // server, so coming back to it must load its history like any other
  useEffect(() => {
    if (createdHereId && conversationId !== createdHereId) {
      setCreatedHereId(undefined);
    }
    // Once left, it is loaded like any other: the modes on screen belong to
    // the conversation switched to
    if (
      startedHereIdRef.current &&
      conversationId !== startedHereIdRef.current
    ) {
      startedHereIdRef.current = undefined;
    }
  }, [conversationId, createdHereId]);
  const isNewConversation =
    !!conversationId && conversationId === createdHereId;

  // Fetch messages with infinite scroll
  const {
    data: messagesData,
    isLoading: isLoadingHistory,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchMessages,
  } = useAgentsControllerGetMessagesInfinite(
    conversationId!,
    { page: 1, limit: 10, sortOrder: 'DESC' },
    {
      query: {
        queryKey: ['/api/agents/conversations', conversationId, 'messages'],
        enabled:
          !!conversationId && !isNewConversation && !isStreamingRef.current,
        // Keep refreshing while a run started elsewhere (another tab, or
        // before we navigated away) is still producing the answer, so the
        // completed response appears without a manual reload.
        refetchInterval: (query) =>
          !isStreamingRef.current && isServerRunning(query.state.data?.pages)
            ? SERVER_STREAM_POLL_MS
            : false,
        getNextPageParam: (lastPage) => {
          const page = lastPage.page ?? 1;
          const limit = lastPage.limit ?? 10;
          const total = lastPage.total ?? 0;
          const hasMore = page * limit < total;
          return hasMore ? page + 1 : undefined;
        },
        initialPageParam: 1,
      },
    },
  );

  // In a ref so the auto-retry timer reads the latest without re-running
  const refetchMessagesRef = useRef(refetchMessages);
  useEffect(() => {
    refetchMessagesRef.current = refetchMessages;
  }, [refetchMessages]);

  // Convert history messages to UIMessage format
  const savedMessages: UIMessage[] = useMemo(() => {
    const pages = messagesData?.pages;
    if (!pages || !Array.isArray(pages)) return [];
    return mapDbMessagesToUI(pages);
  }, [messagesData]);

  // What seeds useChat. `savedMessages` itself stays whole, so the view (and
  // the polling fallback) still shows the partial until resume takes over.
  const seedMessages: UIMessage[] = useMemo(
    () => seedFromSaved(savedMessages, messagesData?.pages),
    [savedMessages, messagesData],
  );

  // Aborts this page's streams of the conversation on screen once the user
  // leaves it (see the resume effect)
  const streamsRef = useRef<AbortController | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/agents/messages/stream',
        headers: selectedWorkspaceId
          ? { 'x-workspace-id': selectedWorkspaceId }
          : {},
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any(
              [init?.signal, streamsRef.current?.signal].filter(
                (s): s is AbortSignal => !!s,
              ),
            ),
          }),
        // On mount (resume), reconnect to a run still producing the answer.
        // A plain GET; the server replays from the start and 204s when there
        // is nothing to resume. The transport headers (workspace id) carry over.
        prepareReconnectToStreamRequest: ({ id }) => ({
          api: `/api/agents/conversations/${id}/stream`,
        }),
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages[messages.length - 1];
          const textContent =
            lastMessage?.parts
              ?.filter((p) => p.type === 'text')
              .map((p) => ('text' in p ? p.text : ''))
              .join('') || '';

          const modelInfo = selectedModelRef.current;
          const convId = conversationId;

          return {
            body: {
              question: textContent,
              ...(convId && { conversationId: convId }),
              ...(modelInfo && {
                model: modelInfo.model,
                provider: modelInfo.provider,
              }),
              agentMode: agentModeRef.current,
              approvalMode: getApprovalMode(),
              workerId: selectedWorkerId,
            },
          };
        },
      }),
    [selectedWorkspaceId, conversationId, selectedWorkerId],
  );

  const {
    messages: chatMessages,
    status,
    sendMessage,
    setMessages,
    regenerate,
    stop,
    resumeStream,
  } = useChat({
    transport,
    id: conversationId || 'agent-new-chat',
    // No `resume` option: it resumes from an effect, which StrictMode runs
    // twice, and two resumes of one run interleave into duplicate messages.
    // The effect below resumes once instead.
    experimental_throttle: 50,
    onError: (error) => {
      // A stream of a conversation the user left, dropped on purpose
      if (error instanceof LeftConversationError) return;
      // Ignore errors from user-initiated stops — not a real error
      if (isUserStoppedRef.current) {
        isUserStoppedRef.current = false;
        return;
      }

      console.error('[Chat] Error:', error);
      // Always set streamError so the auto-retry effect can evaluate it.
      setStreamError(error.message ?? 'An error occurred while streaming');

      // For permanent errors or retries exhausted, reset retry state immediately.
      if (
        !isTransientError(error) ||
        retryCountRef.current >= MAX_AUTO_RETRIES
      ) {
        setIsRetrying(false);
        retryCountRef.current = 0;
        setRetryCount(0);
      }
    },
    onData: (data: { type: string; data: unknown }) => {
      if (data.type === 'data-todos-updated') {
        const payload = data.data as
          { todos: AgentTodoItem[]; goal?: string | null } | undefined;
        // Only sent when the plan tools changed it (null: unpinned)
        if (payload && payload.goal !== undefined) setGoal(payload.goal);
        if (payload?.todos) {
          // Use functional update to avoid stale closure issues
          setTodos((prevTodos) => {
            // Skip update if todos are the same (avoid infinite re-renders)
            if (JSON.stringify(prevTodos) === JSON.stringify(payload.todos)) {
              return prevTodos;
            }
            return payload.todos;
          });
        }
      }
      if (data.type === 'data-approval-required') {
        const incoming = data.data as PendingApproval;
        setApprovalQueue((q) =>
          q.some((a) => a.approvalId === incoming.approvalId)
            ? q
            : [...q, incoming],
        );
      }
      if (data.type === 'data-approval-resolved') {
        // Answered some other way ("allow all", "allow tool", timeout)
        const { approvalId } = data.data as { approvalId: string };
        setApprovalQueue((q) => q.filter((a) => a.approvalId !== approvalId));
      }
      if (data.type === 'data-approval-mode-changed') {
        // The user approved a plan and picked how it runs
        const mode = (data.data as { mode?: unknown } | undefined)?.mode;
        if (isApprovalMode(mode)) syncApprovalMode(mode);
      }
      if (data.type === 'data-conversation-stats') {
        // Sent once a turn ends: model, context usage and turn stats
        const payload = data.data as
          { metadata?: ConversationMetadataDto } | undefined;
        if (payload?.metadata) {
          setConversationMeta(payload.metadata);
          if (payload.metadata.goal !== undefined) {
            setGoal(payload.metadata.goal);
          }
        }
      }
      if (data.type === 'data-subagents-updated') {
        // Sent on every subagent status change, with the whole list
        const payload = data.data as
          { subagents?: SubagentResponseDto[] } | undefined;
        if (payload?.subagents) setSubagents(payload.subagents);
      }
      if (data.type === 'data-remote-execute-output') {
        const event =
          data.data as import('@/hooks/use-remote-execute-stream').RemoteExecuteStreamEvent;
        appendEvent(event);
      }
    },
  });

  // Keep ref in sync
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
    isStreamingRef.current = status === 'submitted' || status === 'streaming';
  }, [chatMessages, status]);

  const isStreaming = status === 'submitted' || status === 'streaming';
  // A run that outlived this page's stream (left and came back, reloaded,
  // another tab) is still busy: show it as streaming and keep Stop available,
  // so a new message does not silently cancel it
  const isServerBusy = !isStreaming && isServerRunning(messagesData?.pages);
  const isBusy = isStreaming || isServerBusy;

  // Once the first stream of a chat created here ends (done, or dropped while
  // the run goes on), the conversation exists on the server: load and poll
  // it like any other
  const hasStreamedRef = useRef(false);
  useEffect(() => {
    if (isStreaming) {
      hasStreamedRef.current = true;
    } else if (hasStreamedRef.current && createdHereId) {
      setCreatedHereId(undefined);
    }
  }, [isStreaming, createdHereId]);

  // Subagent updates only arrive on this page's stream. When the run ends
  // (or the run polled after a reload does) with one still queued/running,
  // reload the detail once to catch changes the stream did not carry.
  const wasBusyRef = useRef(isBusy);
  useEffect(() => {
    const ended = wasBusyRef.current && !isBusy;
    wasBusyRef.current = isBusy;
    if (!ended || !conversationId) return;
    if (!subagentsRef.current.some(isSubagentActive)) return;
    let cancelled = false;
    orvalClient<ConversationResponseDto>({
      url: `/api/agents/conversations/${conversationId}`,
      method: 'GET',
    })
      .then((data) => {
        if (!cancelled) setSubagents(data.subagents ?? []);
      })
      .catch(() => {
        // Keeps the last known list
      });
    return () => {
      cancelled = true;
    };
  }, [isBusy, conversationId]);

  // A pending approval can never outlive its stream
  useEffect(() => {
    if (!isStreaming) setApprovalQueue([]);
  }, [isStreaming]);

  const handleDecideApproval = useCallback(
    async (
      decision: 'approved' | 'rejected',
      options?: ApprovalDecisionOptions,
    ) => {
      if (!pendingApproval) return;
      setIsDecidingApproval(true);
      try {
        if (pendingApproval.kind === 'plan') {
          await orvalClient({
            url: `/api/agents/plan-approvals/${pendingApproval.approvalId}`,
            method: 'PATCH',
            data: {
              status: decision,
              mode: options?.mode,
              feedback: options?.feedback,
            },
          });
          // Reflect the chosen mode right away; the stream confirms it too
          if (decision === 'approved' && options?.mode) {
            syncApprovalMode(options.mode);
          }
        } else {
          await orvalClient({
            url: `/api/agents/command-approvals/${pendingApproval.approvalId}`,
            method: 'PATCH',
            data: {
              status: decision,
              allowConversation: options?.allowConversation,
              allowTool: options?.allowTool,
              feedback: options?.feedback,
            },
          });
        }
        setStreamError(null);
        setApprovalQueue((q) =>
          q.filter((a) => a.approvalId !== pendingApproval.approvalId),
        );
      } catch (error) {
        // 404: the server has no such approval (answered already, or its run
        // ended). Keeping the prompt would block the chat for good, since it
        // can never be decided.
        if (isGoneApprovalError(error)) {
          setApprovalQueue((q) =>
            q.filter((a) => a.approvalId !== pendingApproval.approvalId),
          );
          setStreamError(null);
        } else {
          console.error('[Chat] Failed to submit approval decision', error);
          setStreamError(
            'Could not submit approval decision. Please try again.',
          );
        }
      } finally {
        setIsDecidingApproval(false);
      }
    },
    [pendingApproval],
  );

  // Keep setMessages in a ref to avoid re-triggering the history sync effect
  const setMessagesRef = useRef(setMessages);
  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  // Sync history whenever savedMessages changes but not while streaming.
  // Seeds the stripped copy (seedMessages), so a message a resume will replay
  // is not seeded here and then duplicated by the replay.
  useEffect(() => {
    if (!conversationId || isLoadingHistory || isStreamingRef.current) return;
    if (seedMessages.length > 0) {
      // Use functional update to compare and avoid unnecessary re-renders.
      // Compare a lightweight signature (id + part count) rather than only ids:
      // a polled run keeps the same id while its parts grow, and skipping on
      // id alone would freeze the UI on the stale streaming placeholder.
      setMessagesRef.current((prev) => {
        if (messagesSignature(prev) === messagesSignature(seedMessages)) {
          return prev;
        }
        return seedMessages;
      });
    }
  }, [conversationId, isLoadingHistory, seedMessages]);

  // Reconnect to a run still producing the answer whenever a conversation
  // opens (reload, or switching to it: the page stays mounted across
  // conversations, only useChat's chat changes) and stream the rest, instead
  // of polling the database for it. A chat just started here has no run to
  // resume. Leaving drops this page's streams of the conversation: the old
  // chat would keep reading, feeding its todos and approvals into the one on
  // screen and holding a connection open per visit. The run goes on.
  useEffect(() => {
    if (!conversationId) return;
    const streams = new AbortController();
    streamsRef.current = streams;
    if (startedHereIdRef.current !== conversationId) {
      // The replay continues the chat's newest message when it is an
      // assistant one, so seed from fresh history first: a cached copy can
      // predate the last question, and the replay would merge into the turn
      // before it. Joins the fetch the query already started, if any.
      void refetchMessagesRef
        .current({ cancelRefetch: false })
        .catch(() => undefined)
        .then((fresh) => {
          // Left meanwhile (or StrictMode's first run), or a message was sent
          if (streams.signal.aborted || isStreamingRef.current) return;
          const pages = fresh?.data?.pages;
          if (pages) {
            if (!isServerRunning(pages)) return;
            setMessagesRef.current(
              seedFromSaved(mapDbMessagesToUI(pages), pages),
            );
          }
          return resumeStream();
        });
    }
    return () => {
      streams.abort(new LeftConversationError());
      if (streamsRef.current === streams) streamsRef.current = null;
    };
  }, [conversationId, resumeStream]);

  // Display chatMessages when available, otherwise fall back to savedMessages
  const messages: UIMessage[] =
    chatMessages.length > 0 ? chatMessages : savedMessages;

  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  const handleSendMessage = useCallback(
    async (content: string, options?: { agentMode?: string }) => {
      setStreamError(null);
      // Cancel any pending auto-retry
      retryCountRef.current = 0;
      setRetryCount(0);
      setIsRetrying(false);
      isUserStoppedRef.current = false;
      if (options?.agentMode !== undefined) {
        agentModeRef.current = options.agentMode;
        setAgentMode(options.agentMode);
      }
      await sendMessage({ text: content });
    },
    [sendMessage],
  );

  const handleSelectModel = useCallback(
    (provider: string, model: string, configId: string) => {
      hasUserSelectedModel.current = true;
      setSelectedModel({ provider, model, configId });
    },
    [],
  );

  const handleRetry = useCallback(async () => {
    if (lastAssistantIdx !== -1 && chatMessages.length > 0) {
      setStreamError(null);
      retryCountRef.current = 0;
      setRetryCount(0);
      setIsRetrying(false);
      isUserStoppedRef.current = false;
      await regenerate();
    }
  }, [lastAssistantIdx, chatMessages, regenerate]);

  const handleStop = useCallback(() => {
    isUserStoppedRef.current = true;
    // A stopped run must not be restarted by a pending auto-retry
    abortRetryRef.current?.abort();
    setStreamError(null);
    retryCountRef.current = 0;
    setRetryCount(0);
    setIsRetrying(false);
    // Stop the spinner on the current todo step right away: a stopped run has
    // no step running. The server resets it too (for the next load); this is
    // the optimistic local reflection, since the stream is closing.
    setTodos((prev) =>
      prev.map((t) =>
        t.status === 'in_progress' ? { ...t, status: 'pending' } : t,
      ),
    );
    // Dropping the stream no longer aborts the run (so navigating away keeps
    // it going); an explicit stop must tell the server to abort it.
    if (conversationId) {
      void agentsControllerStopConversation(conversationId)
        // Leave the busy state of a server-side run now, not on the next poll
        .then(() =>
          queryClient.invalidateQueries({
            queryKey: ['/api/agents/conversations', conversationId, 'messages'],
          }),
        )
        .catch(() => {
          // best-effort: the local stop below still ends this client's stream
        });
    }
    stop();
  }, [stop, conversationId, queryClient]);

  const onRetryAction = useMemo(() => {
    return lastAssistantIdx !== -1 && !isBusy ? handleRetry : undefined;
  }, [lastAssistantIdx, isBusy, handleRetry]);

  const hasSentFirstMessage = useMemo(() => {
    return isStreaming || chatMessages.length > 0;
  }, [isStreaming, chatMessages.length]);

  const onLoadMoreAction = useMemo(() => {
    return hasNextPage && !isFetchingNextPage ? fetchNextPage : undefined;
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleDismissError = useCallback(() => {
    setStreamError(null);
    retryCountRef.current = 0;
    setRetryCount(0);
    setIsRetrying(false);
  }, []);

  // Auto-retry with exponential backoff for transient stream errors.
  // When streamError is set and the error is retryable, wait with exponential
  // backoff then call regenerate() to resend the last message.
  useEffect(() => {
    if (!streamError) return;
    if (isStreaming) return;
    // Only the stream dropped: the run goes on, and polling shows it. A
    // retry would start a new run that cancels this one
    if (isServerBusy) return;
    if (lastAssistantIdx === -1) return;
    if (retryCount >= MAX_AUTO_RETRIES) {
      // Out of retries: show the error with its manual Retry, not a spinner
      setIsRetrying(false);
      return;
    }

    // Check if this error is transient — only auto-retry those
    const testError = new Error(streamError);
    if (!isTransientError(testError)) return;

    const backoffMs =
      BASE_RETRY_DELAY_MS * Math.pow(2, retryCount) + Math.random() * 500;

    const controller = new AbortController();
    abortRetryRef.current = controller;

    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;
      // Decide on fresh data: the messages cached before the send say nothing
      // about whether the run outlived the dropped stream, and a retry would
      // cancel a run that did
      const fresh = await refetchMessagesRef.current().catch(() => undefined);
      if (controller.signal.aborted) return;
      const notFound =
        (fresh?.error as { response?: { status?: number } } | null)?.response
          ?.status === 404;
      if (!fresh || (fresh.isError && !notFound)) {
        // Cannot tell: try again after the next backoff
        retryCountRef.current = retryCount + 1;
        setRetryCount((c) => c + 1);
        return;
      }
      // Still running: the effect below ends the error, polling shows the rest
      if (!notFound && isServerRunning(fresh.data?.pages)) return;
      // The run finished while the stream was down: nothing to retry, and a
      // retry would ask the same question again
      if (
        !notFound &&
        isAnsweredOnServer(
          fresh.data?.pages,
          lastUserText(chatMessagesRef.current),
        )
      ) {
        setStreamError(null);
        retryCountRef.current = 0;
        setRetryCount(0);
        setIsRetrying(false);
        return;
      }
      console.log(
        `[Chat] Auto-retry ${retryCount + 1}/${MAX_AUTO_RETRIES} after ${Math.round(backoffMs)}ms`,
      );
      setIsRetrying(true);
      setStreamError(null);
      retryCountRef.current = retryCount + 1;
      setRetryCount((c) => c + 1);
      try {
        await regenerate();
        // Stream succeeded — reset retry state
        if (!controller.signal.aborted) {
          retryCountRef.current = 0;
          setRetryCount(0);
          setIsRetrying(false);
        }
      } catch {
        // onError will handle subsequent errors
      }
    }, backoffMs);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    streamError,
    isStreaming,
    isServerBusy,
    lastAssistantIdx,
    retryCount,
    regenerate,
  ]);

  // The run outlived the dropped stream, so the error is over: polling shows
  // the answer, and no retry may follow once the run ends
  useEffect(() => {
    if (!isServerBusy || !streamError) return;
    abortRetryRef.current?.abort();
    setStreamError(null);
    retryCountRef.current = 0;
    setRetryCount(0);
    setIsRetrying(false);
  }, [isServerBusy, streamError]);

  // Reset retry count when stream starts successfully (only if NOT in auto-retry).
  // During auto-retry, isRetrying is true so this won't interfere.
  useEffect(() => {
    if (isStreaming && !isRetrying) {
      retryCountRef.current = 0;
      setRetryCount(0);
      setIsRetrying(false);
    }
  }, [isStreaming, isRetrying]);

  // Fetch initial todos and agentMode for existing conversations
  useEffect(() => {
    // Subagents belong to one conversation: never show the previous one's
    setSubagents([]);
    if (!conversationId) {
      setTodos([]);
      setGoal(null);
      setConversationMeta(null);
      restoreApprovalMode();
      return;
    }

    // Nothing to load yet: its settings are the ones it was started with
    if (isNewConversation) return;

    // Use a flag to prevent setting state after unmount
    let cancelled = false;
    const approvalVersionAtStart = getApprovalModeVersion();
    const agentModeAtStart = agentModeRef.current;
    // A chat started on this page already holds the modes the user picked
    // (maybe changed since its first message): the server's are older
    const startedHere = startedHereIdRef.current === conversationId;

    orvalClient<ConversationResponseDto>({
      url: `/api/agents/conversations/${conversationId}`,
      method: 'GET',
    })
      .then((data) => {
        if (!cancelled && data.todos) {
          setTodos((prev) => {
            // Only update if different
            if (JSON.stringify(prev) === JSON.stringify(data.todos)) {
              return prev;
            }
            return data.todos as unknown as AgentTodoItem[];
          });
        }
        if (!cancelled && data.title) {
          setTitle(data.title);
        }
        if (!cancelled && data.createdAt) {
          setCreatedAt(data.createdAt as string);
        }
        if (!cancelled) {
          setConversationMeta(data.metadata ?? null);
          setGoal(data.metadata?.goal ?? null);
          setSubagents(data.subagents ?? []);
        }
        const savedApprovalMode = (data as { approvalMode?: string })
          .approvalMode;
        // Never clobber a mode the user picked while this request was pending
        if (
          !cancelled &&
          !startedHere &&
          isApprovalMode(savedApprovalMode) &&
          getApprovalModeVersion() === approvalVersionAtStart
        ) {
          syncApprovalMode(savedApprovalMode);
        }
        if (
          !cancelled &&
          !startedHere &&
          data.agentMode &&
          agentModeRef.current === agentModeAtStart
        ) {
          setAgentMode(data.agentMode);
          agentModeRef.current = data.agentMode;
        }
      })
      .catch(() => {
        // Silently fail - todos will be empty
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, isNewConversation]);

  // Keep handleSendMessage in a ref to avoid re-triggering the auto-send effect
  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Auto-send pending message from landing page
  useEffect(() => {
    const state = location.state as {
      pendingMessage?: string;
      selectedModel?: SelectedModel;
      agentMode?: string;
      workerId?: string | null;
    } | null;
    if (state?.pendingMessage && !hasAutoSentRef.current) {
      hasAutoSentRef.current = true;
      if (state.selectedModel) {
        hasUserSelectedModel.current = true;
        setSelectedModel(state.selectedModel);
        selectedModelRef.current = state.selectedModel;
      }
      if (state.agentMode !== undefined) {
        setAgentMode(state.agentMode);
        agentModeRef.current = state.agentMode;
      }
      if (state.workerId !== undefined) {
        setSelectedWorkerId(state.workerId);
      }
      void handleSendMessageRef.current(state.pendingMessage);
      void navigate({
        to: location.pathname as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- dynamic route path
        replace: true,
        state: undefined,
      });
    }
  }, [location.state, navigate, location.pathname]);

  return {
    messages,
    isStreaming: isBusy,
    isLoadingHistory,
    streamError,
    isRetrying,
    retryAttempt: retryCount,
    todos,
    goal,
    conversationMeta,
    subagents,
    title,
    createdAt,
    selectedModel,
    agentMode,
    selectedWorkerId,
    hasSentFirstMessage,
    hasMoreMessages: hasNextPage ?? false,
    isLoadingMoreMessages: isFetchingNextPage,
    remoteExecuteEvents: eventsMap,
    onSendMessage: handleSendMessage,
    onRetry: onRetryAction,
    onStop: handleStop,
    onSelectModel: handleSelectModel,
    onDismissError: handleDismissError,
    onLoadMore: onLoadMoreAction,
    onWorkerSelect: setSelectedWorkerId,
    pendingApproval,
    pendingApprovalCount: approvalQueue.length,
    isDecidingApproval,
    onDecideApproval: handleDecideApproval,
  };
}
