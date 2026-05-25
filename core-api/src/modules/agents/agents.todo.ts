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
    '# STRICT EXECUTION RULES (MANDATORY):',
    '',
    '1. Identify the FIRST step with status "PENDING" or "IN_PROGRESS" — that is your CURRENT step. Execute ONLY that step.',
    '2. Before calling any action tool, call transition_step(id, "in_progress") to mark the current step.',
    '3. Upon completing the step, call transition_step(id, "completed") IMMEDIATELY before moving to the next step.',
    '4. If a step fails (tool error, no results), call transition_step(id, "failed") and retry with a different approach. Do NOT give up after a single failure — try at least 2 alternative methods.',
    '5. After the current step is "completed" or "failed" after retries, advance to the NEXT "pending" step IMMEDIATELY. Do NOT end your response between steps.',
    '6. Do NOT skip over "pending" steps. Execute them in order one by one.',
    '7. Do NOT attempt to work on future steps before the current step is resolved.',
    '8. ALL STEPS MUST BE EXECUTED IN A SINGLE RESPONSE. Do NOT stop mid-plan. Continue calling tools until every step is done.',
    '9. Keep your analysis text SHORT during execution (1-2 sentences max per step). Save detailed analysis for the final step.',
    '10. If you genuinely need user input (blocked on a decision), explain briefly and STOP. Otherwise, KEEP EXECUTING.',
    '',
    '# RETRY PROTOCOL:',
    '',
    '- If a tool call returns an error: analyze the error, adjust parameters, and retry immediately.',
    '- If a tool call returns empty results: try a different approach (different parameters, different tool).',
    '- Only mark a step as "failed" after exhausting all reasonable retry options.',
    '- Do NOT declare the entire plan failed because one step failed — move on to the next step.',
    '',
  ].join('\n');
}
