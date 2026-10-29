import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  useAgentsControllerGetConversationSubagent,
  type SubagentResponseDto,
} from '@/services/apis/gen/queries';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SUBAGENT_TRANSCRIPT_POLL_MS } from './subagent-transcript';
import { SubagentsPanel } from './subagents-panel';

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAgentsControllerGetConversationSubagent: vi.fn(),
}));

// The conversation sticks to the bottom with a ResizeObserver
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const useDetail = vi.mocked(useAgentsControllerGetConversationSubagent);

const row = (overrides: Partial<SubagentResponseDto>): SubagentResponseDto => ({
  id: 's1',
  name: 'researcher',
  status: 'completed',
  task: 'Find critical CVEs',
  result: 'Two critical CVEs found',
  error: null,
  createdAt: '2026-10-16T00:00:00.000Z',
  startedAt: '2026-10-16T00:00:00.000Z',
  completedAt: '2026-10-16T00:00:04.200Z',
  deliveredAt: null,
  sortOrder: 0,
  stats: null,
  ...overrides,
});

describe('SubagentsPanel', () => {
  beforeEach(() => {
    useDetail.mockReset();
    useDetail.mockReturnValue({
      data: {
        ...row({}),
        transcript: [
          {
            text: 'Checking the issue',
            toolCalls: [
              {
                toolCallId: 'a',
                toolName: 'inspect_issue',
                input: '{"id":"i1"}',
                output: '{"severity":"critical"}',
                error: null,
              },
              {
                toolCallId: 'b',
                toolName: 'list_network_ports',
                input: '{}',
                output: null,
                error: 'timeout',
              },
            ],
          },
          { text: 'Two critical CVEs', toolCalls: [] },
        ],
        transcriptTruncated: false,
      },
      refetch: vi.fn(),
    } as never);
  });

  it('renders nothing without subagents', () => {
    const { container } = render(<SubagentsPanel subagents={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists subagents with status, task and run time', () => {
    render(
      <SubagentsPanel
        subagents={[
          row({}),
          row({
            id: 's2',
            name: 'asset-analyst',
            status: 'in_progress',
            completedAt: null,
            result: null,
          }),
        ]}
      />,
    );

    expect(screen.getByText('1 running')).toBeInTheDocument();
    expect(screen.getByText('@researcher')).toBeInTheDocument();
    expect(screen.getByText('@asset-analyst')).toBeInTheDocument();
    expect(screen.getByText('4.2s')).toBeInTheDocument();
    expect(screen.getByLabelText('Running')).toBeInTheDocument();
    // Nothing is loaded until a subagent is opened
    expect(useDetail).not.toHaveBeenCalled();
  });

  it('opens a subagent in place as a conversation', async () => {
    const user = userEvent.setup();
    render(<SubagentsPanel subagents={[row({})]} conversationId="c1" />);

    await user.click(screen.getByText('@researcher'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useDetail).toHaveBeenCalledWith('c1', 's1', {
      query: { refetchInterval: false },
    });
    // The task (also on the row), the step text, its tool calls and the full
    // final answer
    expect(screen.getAllByText('Find critical CVEs')).toHaveLength(2);
    expect(screen.getByText('Checking the issue')).toBeInTheDocument();
    expect(screen.getByText('2 tool calls')).toBeInTheDocument();
    expect(screen.getByText('Two critical CVEs found')).toBeInTheDocument();

    // Clicking the row again folds it
    await user.click(screen.getByText('@researcher'));
    expect(screen.queryByText('Checking the issue')).not.toBeInTheDocument();
  });

  it('does not open without a conversation to load from', async () => {
    const user = userEvent.setup();
    render(<SubagentsPanel subagents={[row({})]} />);

    await user.click(screen.getByText('@researcher'));
    expect(useDetail).not.toHaveBeenCalled();
  });

  it('shows the input and output of each tool call', async () => {
    const user = userEvent.setup();
    render(<SubagentsPanel subagents={[row({})]} conversationId="c1" />);

    await user.click(screen.getByText('@researcher'));
    await user.click(screen.getByRole('tab', { name: /Tool calls/ }));

    await user.click(screen.getByText('Inspect Issue'));
    expect(screen.getByText(/"severity": "critical"/)).toBeInTheDocument();
    await user.click(screen.getByText('List Network Ports'));
    expect(screen.getByText('timeout')).toHaveClass('text-destructive');
  });

  it('polls the transcript of a running subagent', async () => {
    const user = userEvent.setup();
    render(
      <SubagentsPanel
        subagents={[
          row({ status: 'in_progress', completedAt: null, result: null }),
        ]}
        conversationId="c1"
      />,
    );

    await user.click(screen.getByText('@researcher'));
    expect(useDetail).toHaveBeenCalledWith('c1', 's1', {
      query: { refetchInterval: SUBAGENT_TRANSCRIPT_POLL_MS },
    });
  });

  it('shows a cancelled subagent as stopped, neither running nor polled', async () => {
    const user = userEvent.setup();
    render(
      <SubagentsPanel
        subagents={[row({ status: 'cancelled', result: null })]}
        conversationId="c1"
      />,
    );

    expect(screen.getByLabelText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText('1 done')).toBeInTheDocument();
    await user.click(screen.getByText('@researcher'));
    expect(useDetail).toHaveBeenCalledWith('c1', 's1', {
      query: { refetchInterval: false },
    });
    expect(
      screen.getByText('Cancelled when the conversation was stopped.'),
    ).toBeInTheDocument();
  });
});
