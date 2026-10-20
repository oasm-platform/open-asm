import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  ConversationMetadataDto,
  SubagentResponseDto,
} from '@/services/apis/gen/queries';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import type { UIMessage } from 'ai';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentTodoItem } from './agent-todo-panel';
import {
  ChatSidePanel,
  sidePanelContent,
  type SidePanelTab,
} from './chat-side-panel';

const todos: AgentTodoItem[] = [
  { id: 't1', content: 'Enumerate hosts', status: 'completed', sortOrder: 1, updatedAt: '' },
  { id: 't2', content: 'Scan ports', status: 'in_progress', sortOrder: 2, updatedAt: '' },
];

const subagent: SubagentResponseDto = {
  id: 's1',
  name: 'researcher',
  status: 'in_progress',
  task: 'Find critical CVEs',
  result: null,
  error: null,
  createdAt: '2026-10-16T00:00:00.000Z',
  startedAt: '2026-10-16T00:00:00.000Z',
  completedAt: null,
  deliveredAt: null,
  sortOrder: 0,
  stats: null,
};

const toolMessages: UIMessage[] = [
  {
    id: 'm1',
    role: 'assistant',
    parts: [
      {
        type: 'dynamic-tool',
        toolName: 'list_assets',
        toolCallId: 'c1',
        state: 'output-available',
        input: { targetId: 't1' },
        output: { items: [] },
      },
      {
        type: 'dynamic-tool',
        toolName: 'get_vulnerabilities',
        toolCallId: 'c2',
        state: 'output-error',
        input: { severity: 'critical' },
        errorText: 'timeout',
      },
    ],
  },
];

function Harness({
  subagents = [],
  messages = [],
  remoteExecuteEvents,
  onClose = () => {},
  onSelectToolCall,
}: {
  subagents?: SubagentResponseDto[];
  messages?: UIMessage[];
  remoteExecuteEvents?: Map<string, RemoteExecuteStreamEvent[]>;
  onClose?: () => void;
  onSelectToolCall?: (id: string) => void;
}) {
  const [tab, setTab] = useState<SidePanelTab>('plan');
  return (
    <ChatSidePanel
      tab={tab}
      onTabChange={setTab}
      onClose={onClose}
      todos={todos}
      goal="Assess example.com"
      subagents={subagents}
      messages={messages}
      metadata={null}
      onSelectToolCall={onSelectToolCall}
      remoteExecuteEvents={remoteExecuteEvents}
    />
  );
}

describe('ChatSidePanel', () => {
  it('shows one section at a time, picked by its tab', async () => {
    const user = userEvent.setup();
    render(<Harness subagents={[subagent]} />);

    expect(screen.getByRole('tab', { name: /Plan/ })).toHaveTextContent('1/2');
    expect(screen.getByText('Scan ports')).toBeInTheDocument();
    expect(screen.queryByText('@researcher')).toBeNull();

    await user.click(screen.getByRole('tab', { name: /Subagents/ }));
    expect(screen.getByText('@researcher')).toBeInTheDocument();
    expect(screen.queryByText('Scan ports')).toBeNull();
  });

  it('shows the sections whole, with no header folding them', async () => {
    const user = userEvent.setup();
    render(<Harness subagents={[subagent]} />);

    // The plan's steps and goal, without its "Todo" toggle
    expect(screen.getByText('Assess example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Todo/ })).toBeNull();

    await user.click(screen.getByRole('tab', { name: /Subagents/ }));
    expect(screen.queryByText('1 running')).toBeNull();
  });

  it('lists the tool calls with their details shown', async () => {
    const user = userEvent.setup();
    const onSelectToolCall = vi.fn();
    render(
      <Harness messages={toolMessages} onSelectToolCall={onSelectToolCall} />,
    );

    const tab = screen.getByRole('tab', { name: /Tool calls/ });
    expect(tab).toHaveTextContent('1/2');
    await user.click(tab);

    // Input and output (or error) without unfolding anything
    expect(screen.getByText(/"targetId": "t1"/)).toBeInTheDocument();
    expect(screen.getByText(/"items": \[\]/)).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toHaveClass('text-destructive');

    const [first] = screen.getAllByRole('button', { name: 'Show in chat' });
    await user.click(first);
    expect(onSelectToolCall).toHaveBeenCalledWith('c1');
  });

  it('shows a remote command as its terminal, live while it runs', async () => {
    const user = userEvent.setup();
    const commandMessages: UIMessage[] = [
      {
        id: 'm2',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'execute_remote_command',
            toolCallId: 'k1',
            state: 'input-available',
            input: { command: 'nmap -sV example.com' },
          },
        ],
      },
    ];
    const events = new Map<string, RemoteExecuteStreamEvent[]>([
      ['k1', [{ toolCallId: 'k1', type: 1, data: '22/tcp open ssh' }]],
    ]);
    render(
      <Harness messages={commandMessages} remoteExecuteEvents={events} />,
    );

    await user.click(screen.getByRole('tab', { name: /Tool calls/ }));
    expect(screen.getByText('Terminal')).toBeInTheDocument();
    expect(screen.getByText(/22\/tcp open ssh/)).toBeInTheDocument();
    // Not the JSON blocks other tools get
    expect(screen.queryByText('Input')).toBeNull();
  });

  it('says so when a tab has nothing to show', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('tab', { name: /Subagents/ }));
    expect(screen.getByText('No subagents')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Tool calls/ }));
    expect(screen.getByText('No tool calls yet')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Stats/ }));
    expect(screen.getByText('No stats yet')).toBeInTheDocument();
  });

  it('closes from its own button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close side panel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('sidePanelContent', () => {
  it('flags the tabs that have something to show', () => {
    const metadata = { model: 'claude-sonnet-4-5' } as ConversationMetadataDto;
    expect(
      sidePanelContent({ goal: 'g', subagents: [], messages: [], metadata: null }),
    ).toEqual({ plan: true, subagents: false, tools: false, stats: false });
    expect(
      sidePanelContent({
        todos: [],
        subagents: [subagent],
        messages: toolMessages,
        metadata,
      }),
    ).toEqual({ plan: false, subagents: true, tools: true, stats: true });
  });
});
