import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { ToolCallDisplay, type ToolCallState } from './tool-call-display';

const planCall = (overrides: Partial<ToolCallState> = {}): ToolCallState => ({
  toolCallId: 't1',
  toolName: 'formulate_plan',
  status: 'executing',
  input: { steps: ['Enumerate subdomains', 'Scan ports'] },
  ...overrides,
});

const steps = () => screen.getAllByRole('listitem').map((li) => li.textContent);

describe('ToolCallDisplay for plans', () => {
  it('shows the steps while the plan is being set up or reviewed', () => {
    render(<ToolCallDisplay toolCall={planCall()} />);
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('2 steps')).toBeInTheDocument();
    expect(steps()).toEqual(['Enumerate subdomains', 'Scan ports']);
  });

  it('shows the saved plan once it is ready', () => {
    render(
      <ToolCallDisplay
        toolCall={planCall({
          status: 'completed',
          output: {
            success: true,
            todos: [{ content: 'Enumerate subdomains' }, { content: 'Scan ports' }, { content: 'Report' }],
          },
        })}
      />,
    );
    expect(screen.getByText('Plan ready')).toBeInTheDocument();
    expect(steps()).toEqual(['Enumerate subdomains', 'Scan ports', 'Report']);
  });

  it('marks a plan the user did not approve', () => {
    render(<ToolCallDisplay toolCall={planCall({ status: 'rejected' })} />);
    expect(screen.getByText('Not approved')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveClass('line-through');
  });

  it('marks a plan the server refused', () => {
    render(
      <ToolCallDisplay
        toolCall={planCall({ status: 'completed', output: { success: false, message: 'REJECTED' } })}
      />,
    );
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });

  it('keeps the compact row for other tools', () => {
    render(
      <ToolCallDisplay
        toolCall={{ toolCallId: 't2', toolName: 'list_active_workers', status: 'completed' }}
      />,
    );
    expect(screen.getByText('List Active Workers')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
