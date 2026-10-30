import { AgentApprovalMode } from '@/common/enums/enum';
import { EventEmitter } from 'node:events';
import { browserSessionOf, remoteExecuteTool } from './remote-execute.tool';

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
    const tool = remoteExecuteTool(
      {
        approvals: { authorize: jest.fn().mockResolvedValue({ allowed: true }) },
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
      } as never,
      'w1',
      'c1',
      emitter,
      { userId: 'u1', mode: AgentApprovalMode.AUTO },
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
