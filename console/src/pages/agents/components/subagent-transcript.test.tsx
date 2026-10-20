import type {
  SubagentDetailResponseDto,
  SubagentResponseDto,
} from '@/services/apis/gen/queries';
import { describe, expect, it } from 'vitest';
import { toSubagentMessages } from './subagent-transcript';

const subagent = (
  overrides: Partial<SubagentResponseDto> = {},
): SubagentResponseDto => ({
  id: 's1',
  name: 'researcher',
  status: 'completed',
  task: 'Find CVEs',
  result: 'Full answer',
  error: null,
  createdAt: '2026-10-16T00:00:00.000Z',
  startedAt: '2026-10-16T00:00:00.000Z',
  completedAt: '2026-10-16T00:00:04.200Z',
  deliveredAt: null,
  sortOrder: 0,
  stats: null,
  ...overrides,
});

const detail = (transcriptTruncated = false): SubagentDetailResponseDto => ({
  ...subagent(),
  transcript: [
    {
      text: null,
      toolCalls: [
        {
          toolCallId: 'a',
          toolName: 'inspect_issue',
          input: '{"id":"i1"}',
          output: '{"ok":true}',
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
    { text: 'Full ans… (cut)', toolCalls: [] },
  ],
  transcriptTruncated,
});

describe('toSubagentMessages', () => {
  it('turns the task and steps into a user and an assistant message', () => {
    const [task, run] = toSubagentMessages(subagent(), detail());
    expect(task).toMatchObject({
      role: 'user',
      parts: [{ type: 'text', text: 'Find CVEs' }],
    });
    expect(run.role).toBe('assistant');
    expect(run.parts).toEqual([
      {
        type: 'dynamic-tool',
        toolName: 'inspect_issue',
        toolCallId: 'a',
        input: { id: 'i1' },
        state: 'output-available',
        output: { ok: true },
      },
      {
        type: 'dynamic-tool',
        toolName: 'list_network_ports',
        toolCallId: 'b',
        input: {},
        state: 'output-error',
        errorText: 'timeout',
      },
      // The uncut result replaces the last step's text
      { type: 'text', text: 'Full answer' },
    ]);
  });

  it('adds the result after a truncated transcript', () => {
    const [, run] = toSubagentMessages(subagent(), detail(true));
    expect(run.parts.slice(-2)).toEqual([
      { type: 'text', text: 'Full ans… (cut)' },
      { type: 'text', text: 'Full answer' },
    ]);
  });

  it('shows the result of a run recorded before transcripts existed', () => {
    const [, run] = toSubagentMessages(subagent());
    expect(run.parts).toEqual([{ type: 'text', text: 'Full answer' }]);
  });

  it('opens an empty assistant message for a running subagent only', () => {
    const running = toSubagentMessages(
      subagent({ status: 'in_progress', result: null }),
    );
    expect(running).toHaveLength(2);
    expect(running[1].parts).toEqual([]);

    const queued = toSubagentMessages(
      subagent({ status: 'pending', result: null }),
    );
    expect(queued).toHaveLength(1);
  });
});
