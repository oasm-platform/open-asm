import type { RedisService } from '@/services/redis/redis.service';

/**
 * Who an agent shell command ran for, keyed by its remote-execute session id.
 * The worker's HTTP log events carry only that session id; this is what ties
 * them to a conversation, its owner and the worker that may report them.
 */
export interface HttpLogSession {
  workspaceId: string;
  conversationId: string;
  createdBy: string;
  toolCallId: string | null;
  subagentId: string | null;
  agentName: string;
  workerId: string;
}

/** The command times out after 60 s; this leaves room for slow tunnels to flush. */
export const HTTP_LOG_SESSION_TTL_S = 900;

export const httpLogSessionKey = (sessionId: string) =>
  `agent:http-log:session:${sessionId}`;

type SessionRedis = Pick<RedisService, 'setWithExpiry'> & {
  cacheClient: Pick<RedisService['cacheClient'], 'mget'>;
};

export async function saveHttpLogSession(
  redis: Pick<SessionRedis, 'setWithExpiry'>,
  sessionId: string,
  session: HttpLogSession,
): Promise<void> {
  await redis.setWithExpiry(
    httpLogSessionKey(sessionId),
    HTTP_LOG_SESSION_TTL_S,
    JSON.stringify(session),
  );
}

/** Sessions found, by id; expired and unreadable ones are absent. */
export async function loadHttpLogSessions(
  redis: Pick<SessionRedis, 'cacheClient'>,
  sessionIds: string[],
): Promise<Map<string, HttpLogSession>> {
  const sessions = new Map<string, HttpLogSession>();
  if (!sessionIds.length) return sessions;
  const values = await redis.cacheClient.mget(sessionIds.map(httpLogSessionKey));
  values.forEach((raw, index) => {
    const session = parseSession(raw);
    if (session) sessions.set(sessionIds[index], session);
  });
  return sessions;
}

function parseSession(raw: string | null): HttpLogSession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null
      ? (value as HttpLogSession)
      : null;
  } catch {
    return null;
  }
}
