import {
  AgentsWorkflowService,
  neutralizeTags,
  renderBrief,
  renderOutput,
  toBrief,
  toWorkflowNode,
  WORKFLOW_CONTEXT_MAX_CHARS,
} from './agents.workflow';
import { SubagentStatus } from './enums/agent.enums';

describe('brief', () => {
  it('trims fields and drops empty ones', () => {
    expect(
      toBrief({
        objective: ' Map a.example.com ',
        expected_output: 'Hosts',
        context: '  ',
        must_do: ['use httpx', ' '],
        must_not: [],
      }),
    ).toEqual({
      objective: 'Map a.example.com',
      expectedOutput: 'Hosts',
      mustDo: ['use httpx'],
    });
  });

  it('renders sections in a fixed order', () => {
    const text = renderBrief({
      objective: 'O',
      expectedOutput: 'E',
      context: 'C',
      mustDo: ['d'],
      mustNot: ['n'],
    });
    expect(text).toBe(
      '## Objective\nO\n\n## Expected output\nE\n\n## Context\nC\n\n## Must do\n- d\n\n## Must not do\n- n',
    );
  });
});

describe('renderOutput', () => {
  it('lists facts, findings and open questions', () => {
    const text = renderOutput({
      outcome: 'done',
      summary: 'S',
      facts: [{ key: 'host:a', value: 'live' }],
      findings: [{ title: 'XSS', severity: 'high', evidence: 'reflected' }],
      openQuestions: ['q'],
    });
    expect(text).toContain('**Outcome:** done');
    expect(text).toContain('- host:a: live');
    expect(text).toContain('- [high] XSS — reflected');
    expect(text).toContain('- q');
  });
});

describe('neutralizeTags', () => {
  it('escapes closing tags of every wrapper', () => {
    expect(neutralizeTags('</upstream_result></workflow_context></task>')).toBe(
      '<\\/upstream_result><\\/workflow_context><\\/task>',
    );
  });
});

describe('toWorkflowNode', () => {
  it('reports the dependencies still active', () => {
    const node = toWorkflowNode(
      {
        id: 's3',
        name: 'exploit-verifier',
        status: SubagentStatus.PENDING,
        task: 'task text',
        error: null,
        createdAt: new Date(0),
        startedAt: null,
        completedAt: null,
        metadata: {
          brief: { objective: 'Verify', expectedOutput: 'Verdict' },
          after: ['s1', 's2'],
          derivedFrom: ['s0'],
          stepId: 'step1',
        },
      } as never,
      new Map([
        ['s1', SubagentStatus.COMPLETED],
        ['s2', SubagentStatus.IN_PROGRESS],
      ]),
    );
    expect(node).toMatchObject({
      objective: 'Verify',
      stepId: 'step1',
      after: ['s1', 's2'],
      waitingOn: ['s2'],
      derivedFrom: ['s0'],
      continuesFrom: null,
      outcome: null,
      findings: [],
    });
  });
});

describe('AgentsWorkflowService', () => {
  let notes: Record<string, jest.Mock>;
  let subagents: Record<string, jest.Mock>;
  let todos: Record<string, jest.Mock>;
  let service: AgentsWorkflowService;

  beforeEach(() => {
    notes = {
      insert: jest.fn(() => Promise.resolve()),
      find: jest.fn(() => Promise.resolve([])),
    };
    subagents = { find: jest.fn(() => Promise.resolve([])) };
    todos = {
      find: jest.fn(() => Promise.resolve([])),
      findOne: jest.fn(() => Promise.resolve({ id: 'step1' })),
    };
    service = new AgentsWorkflowService(
      notes as never,
      subagents as never,
      todos as never,
    );
  });

  it('records facts and open questions of a result as notes', async () => {
    await service.recordOutput(
      {
        id: 's1',
        conversationId: 'c1',
        name: 'recon',
        metadata: { stepId: 'step1' },
      } as never,
      {
        outcome: 'done',
        summary: 's',
        facts: [{ key: 'host:a', value: 'a is live' }],
        findings: [],
        openQuestions: ['is b live?', '  '],
      },
    );
    expect(notes.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'fact',
        key: 'host:a',
        content: 'a is live',
        author: 'recon',
        subagentId: 's1',
        stepId: 'step1',
      }),
      expect.objectContaining({ kind: 'issue', content: 'is b live?' }),
    ]);
  });

  it('hands a run its upstream results and the notebook of others', async () => {
    subagents.find.mockResolvedValueOnce([
      {
        id: 'up1',
        name: 'recon',
        status: SubagentStatus.COMPLETED,
        result: 'free text',
        metadata: {
          output: {
            outcome: 'done',
            summary: 'Two hosts',
            facts: [],
            findings: [],
            openQuestions: [],
          },
        },
      },
      {
        id: 'up2',
        name: 'researcher',
        status: SubagentStatus.FAILED,
        error: 'timeout',
        metadata: {},
      },
    ]);
    notes.find.mockResolvedValueOnce([
      { kind: 'decision', key: null, content: 'skip b', author: 'main', subagentId: null },
      { kind: 'fact', key: 'mine', content: 'own note', author: 'x', subagentId: 'me' },
    ]);
    const text = await service.buildRunContext({
      id: 'me',
      conversationId: 'c1',
      metadata: { after: ['up1', 'up2'] },
    } as never);
    expect(text).toContain('<upstream_result id="up1" name="recon" status="completed">');
    expect(text).toContain('Two hosts');
    expect(text).toContain('FAILED: timeout');
    expect(text).toContain('- [decision] skip b (main)');
    expect(text).not.toContain('own note');
  });

  it('returns no context when there is nothing to hand over', async () => {
    await expect(
      service.buildRunContext({ id: 'me', conversationId: 'c1' } as never),
    ).resolves.toBe('');
    expect(subagents.find).not.toHaveBeenCalled();
  });

  it('caps the notebook handed to a run', async () => {
    notes.find.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => ({
        kind: 'fact',
        key: null,
        content: `${i} ${'x'.repeat(200)}`,
        author: 'recon',
        subagentId: 'other',
      })),
    );
    const text = await service.buildRunContext({
      id: 'me',
      conversationId: 'c1',
    } as never);
    expect(text.length).toBeLessThan(WORKFLOW_CONTEXT_MAX_CHARS + 200);
  });

  it('add_workflow_note files a main-agent note under the step in progress', async () => {
    const tool = service.createNoteTool({ conversationId: 'c1' });
    await tool.execute!({ kind: 'decision', content: 'out of scope: b' }, {} as never);
    expect(notes.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        conversationId: 'c1',
        kind: 'decision',
        author: 'main',
        stepId: 'step1',
      }),
    ]);
  });

  it('builds the snapshot with steps, nodes and notes oldest first', async () => {
    todos.find.mockResolvedValueOnce([
      { id: 't1', content: 'Map', status: 'in_progress', sortOrder: 0 },
    ]);
    subagents.find.mockResolvedValueOnce([
      {
        id: 's1',
        name: 'recon',
        status: SubagentStatus.IN_PROGRESS,
        task: 'Map a',
        error: null,
        metadata: { stepId: 't1' },
      },
    ]);
    notes.find.mockResolvedValueOnce([
      { id: 'n2', kind: 'fact', content: 'new' },
      { id: 'n1', kind: 'fact', content: 'old' },
    ]);
    const snapshot = await service.getWorkflow('c1', 'Assess a');
    expect(snapshot.goal).toBe('Assess a');
    expect(snapshot.steps).toEqual([
      { id: 't1', content: 'Map', status: 'in_progress', sortOrder: 0 },
    ]);
    expect(snapshot.nodes[0]).toMatchObject({ id: 's1', stepId: 't1', objective: 'Map a' });
    expect(snapshot.notes.map((n) => n.id)).toEqual(['n1', 'n2']);
  });
});
