import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SubagentResponseDto } from '@/services/apis/gen/queries';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SUBAGENTS_POLL_MS, SubagentsPanel } from './subagents-panel';

const { useSubagents } = vi.hoisted(() => ({ useSubagents: vi.fn() }));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useAgentsControllerGetConversationSubagents: (...args: unknown[]) =>
    useSubagents(...args),
}));

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

/** The refetchInterval the panel passed for the given rows. */
function interval(rows: SubagentResponseDto[]): number | false {
  const options = useSubagents.mock.calls.at(-1)?.[1] as {
    query: { refetchInterval: (q: unknown) => number | false };
  };
  return options.query.refetchInterval({ state: { data: rows } });
}

describe('SubagentsPanel', () => {
  beforeEach(() => useSubagents.mockReset());

  it('renders nothing without subagents', () => {
    useSubagents.mockReturnValue({ data: [] });
    const { container } = render(
      <SubagentsPanel conversationId="c1" isStreaming={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists subagents with status, task and run time', () => {
    useSubagents.mockReturnValue({
      data: [
        row({}),
        row({
          id: 's2',
          name: 'asset-analyst',
          status: 'in_progress',
          completedAt: null,
          result: null,
        }),
      ],
    });
    render(
      <SubagentsPanel conversationId="c1" isStreaming={false} />,
    );

    expect(screen.getByText('1 running')).toBeInTheDocument();
    expect(screen.getByText('@researcher')).toBeInTheDocument();
    expect(screen.getByText('@asset-analyst')).toBeInTheDocument();
    expect(screen.getByText('4.2s')).toBeInTheDocument();
    expect(screen.getByLabelText('Running')).toBeInTheDocument();
  });

  it('shows the result when a subagent is expanded', async () => {
    useSubagents.mockReturnValue({ data: [row({})] });
    const user = userEvent.setup();
    render(
      <SubagentsPanel conversationId="c1" isStreaming={false} />,
    );

    await user.click(screen.getByText('@researcher'));
    expect(
      await screen.findByText('Two critical CVEs found'),
    ).toBeInTheDocument();
  });

  it('polls every second only while streaming or a subagent is active', () => {
    useSubagents.mockReturnValue({ data: [] });
    const { rerender } = render(
      <SubagentsPanel conversationId="c1" isStreaming={false} />,
    );
    expect(useSubagents.mock.calls.at(-1)?.[0]).toBe('c1');
    expect(interval([row({})])).toBe(false);
    expect(interval([row({ status: 'pending' })])).toBe(SUBAGENTS_POLL_MS);

    rerender(<SubagentsPanel conversationId="c1" isStreaming />);
    expect(interval([])).toBe(SUBAGENTS_POLL_MS);
  });
});
