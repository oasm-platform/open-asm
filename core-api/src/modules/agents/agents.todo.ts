export interface AgentTodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  updatedAt: string;
}

const STATUS_SYMBOLS: Record<AgentTodoItem['status'], string> = {
  pending: '[ ]',
  in_progress: '[/]',
  completed: '[x]',
  failed: '[-]',
};

export function formatTodosToPrompt(todos: AgentTodoItem[]): string {
  if (!todos || todos.length === 0) {
    return 'No specific plan has been set up yet.';
  }

  const list = todos
    .map(
      (t, index) =>
        `${STATUS_SYMBOLS[t.status]} Step ${index + 1}: ${t.content} (${t.status.toUpperCase()})`,
    )
    .join('\n');

  return [
    '',
    '# CURRENT EXECUTION PLAN:',
    '',
    'You ARE CURRENTLY EXECUTING a plan consisting of the following steps. Strictly follow the sequence:',
    list,
    '',
    '# ACTION RULES:',
    '',
    '1. Before calling any action tool, verify whether it serves the currently "IN_PROGRESS" step.',
    '2. When starting a step, update the status of that step to "IN_PROGRESS".',
    '3. Immediately upon completing a step, you MUST call the "update_todo_status" tool to transition it to "COMPLETED" before moving to the next step.',
    '4. Do not arbitrarily skip steps unless the previous step has failed ("FAILED") and you have an alternative plan.',
    '',
  ].join('\n');
}
