/**
 * AI Assistant SSE (Server-Sent Events) API Client
 * These endpoints are not included in the generated queries.ts because they use @Sse decorator
 */

import type { GetConversationsResponseDtoConversationsItem } from './gen/queries';
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
export interface MessageStreamEventData {
  messageId?: string;
  conversationId?: string;
  content?: string;
  type?: string;
  createdAt?: string;
  conversation?: GetConversationsResponseDtoConversationsItem;
  error?: ErrorEventData;
}

export interface MessageStreamEvent {
  type: 'message' | 'conversation' | 'error' | 'done';
  data: MessageStreamEventData;
}

/**
 * Create a message with SSE streaming
 * Endpoint: GET /api/ai-assistant/messages/stream (SSE uses GET in NestJS)
 */
export async function* createMessageStream(
  dto: CreateMessageDto,
): AsyncGenerator<MessageStreamEvent> {
  // Build query params for GET request
  const params = new URLSearchParams({
    question: dto.question,
  });

  if (dto.conversationId) {
    params.append('conversationId', dto.conversationId);
  }

  if (dto.isCreateConversation !== undefined) {
    params.append('isCreateConversation', String(dto.isCreateConversation));
  }

  if (dto.agentType !== undefined) {
    params.append('agentType', String(dto.agentType));
  }

  if (dto.model) {
    params.append('model', dto.model);
  }

  if (dto.provider) {
    params.append('provider', dto.provider);
  }

  const url = `/api/ai-assistant/messages/stream?${params.toString()}`;

  const workspaceId = getGlobalWorkspaceId();
  const headers: HeadersInit = {
    Accept: 'text/event-stream',
  };

  if (workspaceId) {
    headers['X-Workspace-Id'] = workspaceId;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include', // Include cookies for authentication
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read error');
    console.error('❌ SSE Request failed:', {
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
    let buffer = ''; // Buffer to accumulate incomplete chunks

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Add new chunk to buffer
      buffer += decoder.decode(value, { stream: true });

      // Split by newlines, but keep the last incomplete line in buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep potentially incomplete last line

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonData = line.slice(6).trim();
            if (jsonData) {
              const rawData = JSON.parse(jsonData);

              // Transform raw backend data to typed events
              // Raw data format is now flat: { "content": "...", "type": "...", "conversation": {...} }

              if (rawData.content || rawData.type) {
                yield {
                  type: 'message',
                  data: rawData,
                } as MessageStreamEvent;
              }

              // Handle error wrapper if present
              if (rawData.error) {
                yield {
                  type: 'error',
                  data: rawData.error,
                } as MessageStreamEvent;
              }
            }
          } catch {
            // Incomplete JSON chunk - will be completed in next iteration
            console.warn('⚠️ Skipping incomplete SSE chunk');
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
          yield {
            type: 'message',
            data,
          } as MessageStreamEvent;
        }
      } catch (e) {
        console.error('Error parsing final SSE buffer:', e);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Update a message with SSE streaming
 * Endpoint: POST /api/ai-assistant/conversations/:conversationId/messages/:messageId/stream
 */
export async function* updateMessageStream(
  conversationId: string,
  messageId: string,
  dto: UpdateMessageDto,
): AsyncGenerator<MessageStreamEvent> {
  const workspaceId = getGlobalWorkspaceId();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (workspaceId) {
    headers['X-Workspace-Id'] = workspaceId;
  }

  const response = await fetch(
    `/api/ai-assistant/conversations/${conversationId}/messages/${messageId}/stream`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(dto),
      credentials: 'include',
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
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

              if (rawData.content || rawData.type) {
                yield {
                  type: 'message',
                  data: rawData,
                } as MessageStreamEvent;
              }
              if (rawData.error) {
                yield {
                  type: 'error',
                  data: rawData.error,
                } as MessageStreamEvent;
              }
            }
          } catch {
            console.warn('⚠️ Skipping incomplete SSE chunk');
          }
        }
      }
    }

    if (buffer.trim() && buffer.startsWith('data: ')) {
      try {
        const jsonData = buffer.slice(6).trim();
        if (jsonData) {
          const data = JSON.parse(jsonData);
          yield {
            type: 'message',
            data,
          } as MessageStreamEvent;
        }
      } catch (e) {
        console.error('Error parsing final buffer:', e);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
