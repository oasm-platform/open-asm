/**
 * Agents SSE (Server-Sent Events) API Client
 * These endpoints are not included in the generated queries.ts because they use @Sse decorator
 */

import { getGlobalWorkspaceId } from '@/utils/workspaceState';

export interface CreateMessageDto {
  question: string;
  conversationId?: string;
  isCreateConversation?: boolean;
  agentType?: number;
  model?: string;
  provider?: string;
}

export interface UpdateMessageDto {
  question: string;
}

export interface ErrorEventData {
  message: string;
  code?: string;
  details?: unknown;
}

// SSE Event data types
export interface ToolCallEventData {
  toolCallId: string;
  toolName: string;
  input?: Record<string, unknown>;
  output?: unknown;
  argsTextDelta?: string;
}

export interface MessageStreamEventData {
  messageId?: string;
  conversationId?: string;
  content?: string;
  type?: string;
  createdAt?: string;
  error?: string;
  errorCode?: string;
  done?: boolean;
  // Tool call fields
  toolCallId?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  argsTextDelta?: string;
}

export interface MessageStreamEvent {
  type: 'message' | 'conversation' | 'error' | 'done';
  data: MessageStreamEventData;
}

/**
 * Create a message with SSE streaming
 * Endpoint: POST /api/agents/messages/stream
 */
export async function* createMessageStream(
  dto: CreateMessageDto,
): AsyncGenerator<MessageStreamEvent> {
  const workspaceId = getGlobalWorkspaceId();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  if (workspaceId) {
    headers['X-Workspace-Id'] = workspaceId;
  }

  const response = await fetch('/api/agents/messages/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      question: dto.question,
      conversationId: dto.conversationId,
      ...(dto.model && dto.provider && { model: dto.model, provider: dto.provider }),
    }),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read error');
    console.error('SSE Request failed:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });
    throw new Error(
      `HTTP error! status: ${response.status}, message: ${errorText}`,
    );
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('No response body');
  }

  try {
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonData = line.slice(6).trim();
            if (jsonData) {
              const rawData = JSON.parse(jsonData);

              if (rawData.done) {
                return;
              }

              if (rawData.content !== undefined || rawData.type) {
                yield {
                  type: rawData.error ? 'error' : 'message',
                  data: rawData,
                } as MessageStreamEvent;
              }
            }
          } catch {
            console.warn('Skipping incomplete SSE chunk');
          }
        }
      }
    }

    // Process any remaining buffered data
    if (buffer.trim() && buffer.startsWith('data: ')) {
      try {
        const jsonData = buffer.slice(6).trim();
        if (jsonData) {
          const data = JSON.parse(jsonData);
          if (!data.done) {
            yield {
              type: 'message',
              data,
            } as MessageStreamEvent;
          }
        }
      } catch (e) {
        console.error('Error parsing final SSE buffer:', e);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
