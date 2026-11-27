import {
  HTTP_LOG_SESSION_TTL_S,
  type HttpLogSession,
  httpLogSessionKey,
  loadHttpLogSessions,
  saveHttpLogSession,
} from './http-log-session';

const session: HttpLogSession = {
  workspaceId: 'ws-1',
  conversationId: 'c-1',
  createdBy: 'u-1',
  toolCallId: 't-1',
  subagentId: null,
  agentName: 'main',
  workerId: 'w-1',
};

const redisWith = (mget: jest.Mock = jest.fn()) => ({
  setWithExpiry: jest.fn().mockResolvedValue('OK'),
  cacheClient: { mget },
});

describe('http-log-session', () => {
  it('keys a session by its remote-execute session id', () => {
    expect(httpLogSessionKey('s-1')).toBe('agent:http-log:session:s-1');
  });

  it('saves the session as JSON with a 15 minute TTL', async () => {
    const redis = redisWith();
    await saveHttpLogSession(redis, 's-1', session);
    expect(HTTP_LOG_SESSION_TTL_S).toBe(900);
    expect(redis.setWithExpiry).toHaveBeenCalledWith(
      'agent:http-log:session:s-1',
      900,
      JSON.stringify(session),
    );
  });

  it('loads every session in one MGET and drops missing or malformed ones', async () => {
    const mget = jest
      .fn()
      .mockResolvedValue([JSON.stringify(session), null, '{not json', '42']);
    const redis = redisWith(mget);

    const found = await loadHttpLogSessions(redis, ['s-1', 's-2', 's-3', 's-4']);

    expect(mget).toHaveBeenCalledTimes(1);
    expect(mget).toHaveBeenCalledWith([
      'agent:http-log:session:s-1',
      'agent:http-log:session:s-2',
      'agent:http-log:session:s-3',
      'agent:http-log:session:s-4',
    ]);
    expect([...found.keys()]).toEqual(['s-1']);
    expect(found.get('s-1')).toEqual(session);
  });

  it('skips Redis when there is nothing to load', async () => {
    const mget = jest.fn();
    await expect(loadHttpLogSessions(redisWith(mget), [])).resolves.toEqual(
      new Map(),
    );
    expect(mget).not.toHaveBeenCalled();
  });
});
