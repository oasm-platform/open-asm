import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import type { PendingApproval } from '@/hooks/use-agent-chat';
import { CommandApprovalPrompt } from './command-approval-prompt';

const approval = (overrides: Partial<PendingApproval> = {}): PendingApproval => ({
  approvalId: 'ap1',
  toolCallId: 't1',
  command: 'nmap -sV example.com',
  mode: 'manual',
  ...overrides,
});

const planApproval = (): PendingApproval =>
  approval({
    kind: 'plan',
    command: '',
    mode: 'plan',
    tool: 'formulate_plan',
    description: 'Review the plan before the agent starts running it',
    plan: ['Enumerate subdomains', 'Scan ports'],
  });

const renderPrompt = (pending: PendingApproval) => {
  const onDecide = vi.fn();
  render(
    <CommandApprovalPrompt
      approval={pending}
      queueSize={1}
      isSubmitting={false}
      onDecide={onDecide}
    />,
  );
  // the prompt ignores input for a moment after it appears
  act(() => {
    vi.advanceTimersByTime(600);
  });
  return onDecide;
};

describe('CommandApprovalPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks about a single command', () => {
    const onDecide = renderPrompt(approval());

    expect(screen.getByText('Run this command?')).toBeInTheDocument();
    expect(screen.getByText('nmap -sV example.com')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Yes, allow all requests in this conversation'));
    expect(onDecide).toHaveBeenCalledWith('approved', { allowConversation: true });
  });

  it('shows MCP title, source, description, and annotations', () => {
    renderPrompt(
      approval({
        command: 'partner_scan {"target":"example.com"}',
        tool: 'partner_scan',
        description: 'Scan an external partner target.',
        toolMetadata: {
          source: 'mcp',
          server: 'partner',
          name: 'scan',
          title: 'Partner scan',
          annotations: {
            destructiveHint: true,
            openWorldHint: true,
          },
        },
      }),
    );

    expect(screen.getByText('Allow Partner scan?')).toBeInTheDocument();
    expect(
      screen.getByText('Scan an external partner target.'),
    ).toBeInTheDocument();
    expect(screen.getByText('MCP server: partner')).toBeInTheDocument();
    expect(screen.getByText('May be destructive')).toBeInTheDocument();
    expect(screen.getByText('Uses external services')).toBeInTheDocument();
  });

  describe('allowing a tool', () => {
    const toolApproval = (input: Record<string, unknown> = { url: 'a' }) =>
      approval({
        command: 'fetch_page {"url":"a"}',
        tool: 'fetch_page',
        toolMetadata: { title: 'Fetch page' },
        input,
      });

    it('allows the tool for the rest of the conversation', () => {
      const onDecide = renderPrompt(toolApproval());
      fireEvent.click(screen.getByText('Yes, allow Fetch page in this conversation'));
      expect(onDecide).toHaveBeenCalledWith('approved', { allowTool: true });
    });

    it('numbers every option, so 3 is "allow all"', () => {
      const onDecide = renderPrompt(toolApproval());
      fireEvent.keyDown(window, { key: '3' });
      expect(onDecide).toHaveBeenCalledWith('approved', { allowConversation: true });
    });

    it('is not offered for shell commands', () => {
      renderPrompt(approval());
      expect(screen.queryByText(/^Yes, allow (?!all requests)/)).toBeNull();
      expect(screen.getByText('Yes, allow all requests in this conversation')).toBeInTheDocument();
    });

    it('collapses long values until asked', () => {
      const long = 'x'.repeat(5000);
      renderPrompt(toolApproval({ body: long }));
      expect(screen.queryByText(long, { exact: false })).toBeNull();
      fireEvent.click(screen.getByText('Show all (5,000 characters)'));
      expect(screen.getByText(long, { exact: false })).toBeInTheDocument();
    });
  });

  describe('plan', () => {
    it('shows every step of the plan', () => {
      renderPrompt(planApproval());

      expect(screen.getByRole('alertdialog', { name: 'Plan approval' })).toBeInTheDocument();
      expect(screen.getByText('Run this plan?')).toBeInTheDocument();
      const steps = screen.getAllByRole('listitem').map((li) => li.textContent);
      expect(steps).toEqual(['Enumerate subdomains', 'Scan ports']);
      // no command box or "allow all" for a plan
      expect(screen.queryByText('Yes, allow all requests in this conversation')).not.toBeInTheDocument();
    });

    it('approves it in auto mode', () => {
      const onDecide = renderPrompt(planApproval());
      fireEvent.click(screen.getByText('Yes, run it automatically'));
      expect(onDecide).toHaveBeenCalledWith('approved', { mode: 'auto' });
    });

    it('approves it in manual mode from the keyboard', () => {
      const onDecide = renderPrompt(planApproval());
      fireEvent.keyDown(window, { key: '2' });
      expect(onDecide).toHaveBeenCalledWith('approved', { mode: 'manual' });
    });

    it('rejects it with what to change', () => {
      const onDecide = renderPrompt(planApproval());
      const input = screen.getByPlaceholderText('Tell the agent how to change the plan');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'skip the port scan' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onDecide).toHaveBeenCalledWith('rejected', { feedback: 'skip the port scan' });
    });

    it('rejects it on Escape', () => {
      const onDecide = renderPrompt(planApproval());
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onDecide).toHaveBeenCalledWith('rejected', undefined);
    });
  });
});
