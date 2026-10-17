import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SubagentResponseDto } from '@/services/apis/gen/queries';
import { describe, expect, it } from 'vitest';
import { SubagentsPanel } from './subagents-panel';

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
  });

  it('shows the result when a subagent is expanded', async () => {
    const user = userEvent.setup();
    render(<SubagentsPanel subagents={[row({})]} />);

    await user.click(screen.getByText('@researcher'));
    expect(
      await screen.findByText('Two critical CVEs found'),
    ).toBeInTheDocument();
  });
});
