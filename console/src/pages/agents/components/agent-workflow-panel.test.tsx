import type {
  SubagentResponseDto,
  WorkflowResponseDto,
} from '@/services/apis/gen/queries';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentWorkflowPanel } from './agent-workflow-panel';

// React Flow measures its nodes; jsdom has neither the observer nor a layout
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get: () => 220,
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get: () => 76,
});

const workflow: WorkflowResponseDto = {
  goal: 'Assess example.com',
  steps: [{ id: 't1', content: 'Map the surface', status: 'in_progress', sortOrder: 0 }],
  nodes: [
    {
      id: 's1',
      name: 'recon',
      status: 'in_progress',
      objective: 'Map api.example.com',
      stepId: 't1',
      after: [],
      waitingOn: [],
      derivedFrom: [],
      continuesFrom: null,
      outcome: null,
      summary: null,
      findings: [],
      error: null,
      createdAt: '2026-11-10T00:00:00.000Z',
      startedAt: '2026-11-10T00:00:00.000Z',
      completedAt: null,
    },
  ],
  notes: [
    {
      id: 'n1',
      kind: 'decision',
      key: null,
      content: 'staging.example.com is out of scope',
      author: 'main',
      subagentId: null,
      stepId: 't1',
      createdAt: '2026-11-10T00:00:00.000Z',
    },
  ],
};

const subagent: SubagentResponseDto = {
  id: 's1',
  name: 'recon',
  status: 'in_progress',
  task: '## Objective\nMap api.example.com',
  result: null,
  error: null,
  createdAt: '2026-11-10T00:00:00.000Z',
  startedAt: '2026-11-10T00:00:00.000Z',
  completedAt: null,
  deliveredAt: null,
  sortOrder: 0,
  stats: null,
};

const mutate = vi.fn();
const refetch = vi.fn();

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAgentsControllerGetConversationWorkflow: () => ({
    data: workflow,
    isLoading: false,
    refetch,
  }),
  useAgentsControllerCancelConversationSubagent: () => ({
    mutate,
    isPending: false,
  }),
  useAgentsControllerGetConversationSubagent: () => ({
    data: undefined,
    refetch: vi.fn(),
  }),
}));

describe('AgentWorkflowPanel', () => {
  beforeEach(() => {
    mutate.mockClear();
    refetch.mockClear();
  });

  it('shows the goal, the step lanes with their agents and the notebook', () => {
    render(
      <AgentWorkflowPanel conversationId="c1" subagents={[subagent]} planVersion="t1:in_progress" />,
    );
    expect(screen.getByText('Assess example.com')).toBeInTheDocument();
    expect(screen.getByText('1. Map the surface')).toBeInTheDocument();
    expect(screen.getByText('@recon')).toBeInTheDocument();
    expect(screen.getByText('staging.example.com is out of scope')).toBeInTheDocument();
  });

  it('stops a running agent picked in the graph', async () => {
    const user = userEvent.setup();
    render(
      <AgentWorkflowPanel conversationId="c1" subagents={[subagent]} planVersion="" />,
    );
    // A plain click: the canvas' d3 drag handler needs a real window on mousedown
    fireEvent.click(screen.getByText('Map api.example.com'));
    await user.click(screen.getByRole('button', { name: /Stop/ }));
    expect(mutate).toHaveBeenCalledWith({ id: 'c1', subagentId: 's1' });
  });

  it('refetches when the stream reports a change', () => {
    const { rerender } = render(
      <AgentWorkflowPanel conversationId="c1" subagents={[subagent]} planVersion="a" />,
    );
    const calls = refetch.mock.calls.length;
    rerender(
      <AgentWorkflowPanel
        conversationId="c1"
        subagents={[{ ...subagent, status: 'completed' }]}
        planVersion="a"
      />,
    );
    expect(refetch.mock.calls.length).toBeGreaterThan(calls);
  });
});
