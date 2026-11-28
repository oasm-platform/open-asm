import { AgentApprovalMode } from '@/modules/agents/enums/agent.enums';
import { EventEmitter } from 'node:events';
import { agentFunctionWith } from '../agents.tools.testing';
import type { AgentFunctionBuildContext } from './types';
import { RemoteExecuteTools, browserSessionOf } from './remote-execute.tool';

const SESSION = `b-${'0123456789abcdef'.repeat(2)}`;

describe('browserSessionOf', () => {
  it('reads the session a command names with -s', () => {
    expect(browserSessionOf(`browser -s ${SESSION} click @e3`, '')).toBe(
      SESSION,
    );
    expect(
      browserSessionOf(`browser --timeout 5000 -s ${SESSION} snapshot -i`, ''),
    ).toBe(SESSION);
  });

  it('reads the session browser open started from its output', () => {
    expect(
      browserSessionOf(
        'browser open https://example.com',
        `session: ${SESSION}\r\ntitle: Example`,
      ),
    ).toBe(SESSION);
  });

  it('ignores a CSS -s and anything that is not a session id', () => {
    expect(
      browserSessionOf('browser snapshot -s #main', 'session: b-123'),
    ).toBeUndefined();
    expect(browserSessionOf('curl -s https://example.com', '')).toBeUndefined();
  });
});

describe('remoteExecuteTool browser screenshots', () => {
  const run = async (command: string, stdout: string) => {
    const emitter = new EventEmitter();
    const shots: unknown[] = [];
    emitter.on('browser-screenshot', (shot) => shots.push(shot));
    const tool = agentFunctionWith(
      RemoteExecuteTools,
      'execute_remote_command',
      {
        approvals: { authorize: jest.fn().mockResolvedValue({ allowed: true }) },
        guard: { evaluate: jest.fn().mockResolvedValue({ action: 'default' }) },
        remoteExecuteService: {
          waitForResult: jest.fn().mockResolvedValue({
            stdout,
            stderr: '',
            exitCode: 0,
            timedOut: false,
            image: '/9j/4AAQ',
          }),
        },
        redisService: { setex: jest.fn() },
      },
      {
        workspaceId: 'w1',
        conversationId: 'c1',
        emitter,
        approval: { userId: 'u1', mode: AgentApprovalMode.AUTO },
      },
    );
    const result = await (
      tool.execute as (input: unknown, options: unknown) => Promise<unknown>
    )({ command }, { toolCallId: 't1' });
    return { shots, result };
  };

  it('labels the page with the session the command ran in', async () => {
    const { shots, result } = await run(
      'browser open https://example.com',
      `session: ${SESSION}\ntitle: Example`,
    );
    expect(shots).toEqual([
      {
        toolCallId: 't1',
        command: 'browser open https://example.com',
        image: '/9j/4AAQ',
        browserSessionId: SESSION,
      },
    ]);
    // The picture is for the user only
    expect(result).not.toHaveProperty('image');
  });
});

describe('remoteExecuteTool HTTP log session', () => {
  type BeforePush = ((workerId: string) => Promise<void>) | undefined;

  const run = async (
    ctx: Partial<AgentFunctionBuildContext>,
    setWithExpiry = jest.fn().mockResolvedValue('OK'),
  ) => {
    let beforePush: BeforePush;
    let sessionId = '';
    let writtenBeforePush = false;
    const waitForResult = jest.fn(
      async (_cmd: string, sid: string, ...rest: unknown[]) => {
        sessionId = sid;
        beforePush = rest[5] as BeforePush;
        // What RemoteExecuteSubscribeService does once it picked the worker
        await beforePush?.('w-9');
        writtenBeforePush = setWithExpiry.mock.calls.length > 0;
        return { stdout: 'ok', stderr: '', exitCode: 0, timedOut: false };
      },
    );
    const tool = agentFunctionWith(
      RemoteExecuteTools,
      'execute_remote_command',
      {
        approvals: { authorize: jest.fn().mockResolvedValue({ allowed: true }) },
        guard: { evaluate: jest.fn().mockResolvedValue({ action: 'default' }) },
        remoteExecuteService: { waitForResult },
        redisService: { setex: jest.fn(), setWithExpiry },
      },
      {
        workspaceId: 'w1',
        approval: { userId: 'u1', mode: AgentApprovalMode.AUTO },
        ...ctx,
      },
    );
    const result = (await (
      tool.execute as (input: unknown, options: unknown) => Promise<unknown>
    )({ command: 'curl https://example.com' }, { toolCallId: 't1' })) as {
      exitCode: number | null;
    };
    return { result, beforePush, sessionId, writtenBeforePush };
  };

  it('writes the session with the picked worker before the push', async () => {
    const setWithExpiry = jest.fn().mockResolvedValue('OK');
    const { sessionId, writtenBeforePush } = await run(
      {
        conversationId: 'c1',
        userId: 'u1',
        agentName: 'recon',
        subagentId: 'sa-1',
      },
      setWithExpiry,
    );

    expect(writtenBeforePush).toBe(true);
    expect(setWithExpiry).toHaveBeenCalledWith(
      `agent:http-log:session:${sessionId}`,
      900,
      JSON.stringify({
        workspaceId: 'w1',
        conversationId: 'c1',
        createdBy: 'u1',
        toolCallId: 't1',
        subagentId: 'sa-1',
        agentName: 'recon',
        workerId: 'w-9',
      }),
    );
  });

  it('names the main agent when no definition runs the tools', async () => {
    const setWithExpiry = jest.fn().mockResolvedValue('OK');
    await run({ conversationId: 'c1', userId: 'u1' }, setWithExpiry);
    const written = JSON.parse(setWithExpiry.mock.calls[0][2] as string) as {
      agentName: string;
      subagentId: string | null;
    };
    expect(written.agentName).toBe('main');
    expect(written.subagentId).toBeNull();
  });

  it('writes no session without a conversation or a user', async () => {
    const setWithExpiry = jest.fn();
    const noConv = await run({ userId: 'u1' }, setWithExpiry);
    const noUser = await run({ conversationId: 'c1' }, setWithExpiry);
    expect(noConv.beforePush).toBeUndefined();
    expect(noUser.beforePush).toBeUndefined();
    expect(setWithExpiry).not.toHaveBeenCalled();
  });

  it('still runs the command when Redis fails', async () => {
    const { result } = await run(
      { conversationId: 'c1', userId: 'u1' },
      jest.fn().mockRejectedValue(new Error('redis down')),
    );
    expect(result.exitCode).toBe(0);
  });
});
