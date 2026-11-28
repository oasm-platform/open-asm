import type { AgentHttpRequest } from './agent-http-request.entity';
import { AgentHttpOutcome } from './agent-http-request.enums';
import type {
  AgentHttpOutcomeName,
  AgentHttpRequestListItemDto,
} from './dto/agent-http-request.dto';

export const OUTCOME_NAMES: Record<AgentHttpOutcome, AgentHttpOutcomeName> = {
  [AgentHttpOutcome.ALLOWED]: 'allowed',
  [AgentHttpOutcome.DENIED]: 'denied',
  [AgentHttpOutcome.UPSTREAM_ERROR]: 'upstream_error',
  [AgentHttpOutcome.CANCELLED]: 'cancelled',
};

/** Shared by the list route and the chat-stream push, so both send one shape. */
export function toListItem(
  row: Omit<AgentHttpRequest, 'conversation'>,
  conversationTitle: string | null = null,
): AgentHttpRequestListItemDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    conversationTitle,
    toolCallId: row.toolCallId,
    runId: row.runId,
    subagentId: row.subagentId,
    agentName: row.agentName,
    workerId: row.workerId,
    scheme: row.scheme,
    method: row.method,
    host: row.host,
    port: row.port,
    path: row.path,
    statusCode: row.statusCode,
    outcome: OUTCOME_NAMES[row.outcome],
    error: row.error,
    requestBytes: row.requestBytes,
    responseBytes: row.responseBytes,
    sentAt: row.sentAt,
    completedAt: row.completedAt,
    durationMs: row.durationMs,
    tlsIntercepted: row.tlsIntercepted,
    createdAt: row.createdAt,
  };
}
