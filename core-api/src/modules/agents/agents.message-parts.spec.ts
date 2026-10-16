import {
  appendLiveText,
  buildMessageParts,
  findLiveTool,
  type LiveStep,
  type PartsStep,
} from './agents.completions';

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

const step = (content: unknown[]): PartsStep =>
  ({ content }) as unknown as PartsStep;

describe('buildMessageParts', () => {
  it('keeps the stream order of a finished step', () => {
    const parts = buildMessageParts([
      step([
        { type: 'reasoning', text: ' plan ' },
        { type: 'text', text: 'Let me scan the host' },
        {
          type: 'tool-call',
          toolCallId: 't1',
          toolName: 'scan',
          input: { a: 1 },
        },
        { type: 'tool-result', toolCallId: 't1', output: { ok: true } },
      ]),
      step([{ type: 'text', text: 'found it' }]),
    ]);
    expect(parts).toEqual([
      { type: 'reasoning', text: 'plan' },
      { type: 'text', text: 'Let me scan the host' },
      {
        type: 'dynamic-tool',
        toolCallId: 't1',
        toolName: 'scan',
        state: 'output-available',
        input: { a: 1 },
        output: { ok: true },
      },
      { type: 'text', text: 'found it' },
    ]);
  });

  it('stores a failed tool of a finished step as an error, not as running', () => {
    const parts = buildMessageParts([
      step([
        { type: 'tool-call', toolCallId: 't1', toolName: 'scan', input: {} },
        { type: 'tool-error', toolCallId: 't1', error: new Error('boom') },
      ]),
    ]);
    expect(parts).toEqual([
      {
        type: 'dynamic-tool',
        toolCallId: 't1',
        toolName: 'scan',
        state: 'output-error',
        input: {},
        output: null,
        errorText: 'boom',
      },
    ]);
  });

  it('ignores preliminary tool results', () => {
    const parts = buildMessageParts([
      step([
        { type: 'tool-call', toolCallId: 't1', toolName: 'scan', input: {} },
        { type: 'tool-result', toolCallId: 't1', output: 1, preliminary: true },
      ]),
    ]);
    expect(parts[0]).toMatchObject({ state: 'input-available', output: null });
  });

  it('appends the live step in arrival order so a mid-run poll shows it', () => {
    const live: LiveStep = { segments: [] };
    appendLiveText(live, 'reasoning', 'r1', 'checking ');
    appendLiveText(live, 'reasoning', 'r1', 'ports');
    appendLiveText(live, 'text', 'x1', 'Scanning');
    live.segments.push({
      type: 'tool',
      toolCallId: 't2',
      toolName: 'nmap',
      state: 'input-available',
      input: { host: 'x' },
    });
    const parts = buildMessageParts(
      [step([{ type: 'text', text: 'one' }])],
      live,
    );
    expect(parts).toEqual([
      { type: 'text', text: 'one' },
      { type: 'reasoning', text: 'checking ports' },
      { type: 'text', text: 'Scanning' },
      {
        type: 'dynamic-tool',
        toolCallId: 't2',
        toolName: 'nmap',
        state: 'input-available',
        input: { host: 'x' },
        output: null,
      },
    ]);
  });

  it('opens a new block when another text block starts', () => {
    const live: LiveStep = { segments: [] };
    appendLiveText(live, 'text', 'a', 'first');
    appendLiveText(live, 'text', 'b', 'second');
    expect(buildMessageParts([], live)).toEqual([
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ]);
  });

  it('finds and keeps the error text of a failed live tool', () => {
    const live: LiveStep = {
      segments: [
        {
          type: 'tool',
          toolCallId: 't3',
          toolName: 'fetch',
          state: 'input-available',
        },
      ],
    };
    const tool = findLiveTool(live, 't3');
    expect(tool).toBeDefined();
    tool!.state = 'output-error';
    tool!.errorText = 'Stopped';
    expect(buildMessageParts([], live)).toEqual([
      {
        type: 'dynamic-tool',
        toolCallId: 't3',
        toolName: 'fetch',
        state: 'output-error',
        input: undefined,
        output: null,
        errorText: 'Stopped',
      },
    ]);
  });

  it('puts the fallback reasoning first only when no step has reasoning', () => {
    expect(
      buildMessageParts(
        [step([{ type: 'text', text: 'hi' }])],
        undefined,
        'why',
      ),
    ).toEqual([
      { type: 'reasoning', text: 'why' },
      { type: 'text', text: 'hi' },
    ]);
    expect(
      buildMessageParts(
        [
          step([
            { type: 'reasoning', text: 'own' },
            { type: 'text', text: 'hi' },
          ]),
        ],
        undefined,
        'why',
      ),
    ).toEqual([
      { type: 'reasoning', text: 'own' },
      { type: 'text', text: 'hi' },
    ]);
  });

  it('returns nothing for an empty run', () => {
    expect(buildMessageParts([], { segments: [] })).toEqual([]);
  });
});
