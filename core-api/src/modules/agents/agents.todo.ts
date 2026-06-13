export interface AgentTodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  sortOrder: number;
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

  const completedCount = todos.filter((t) => t.status === 'completed').length;
  const failedCount = todos.filter((t) => t.status === 'failed').length;
  const currentStep = todos.find(
    (t) => t.status === 'pending' || t.status === 'in_progress',
  );
  const currentStepIndex = currentStep
    ? todos.indexOf(currentStep)
    : -1;

  const list = todos
    .map(
      (t, index) => {
        const isCurrent = index === currentStepIndex;
        const marker = isCurrent ? ' <<<< YOU ARE HERE' : '';
        return `${STATUS_SYMBOLS[t.status]} Step ${index + 1}: ${t.content} (${t.status.toUpperCase()})${marker}`;
      },
    )
    .join('\n');

  return [
    '',
    '# CURRENT EXECUTION PLAN:',
    '',
    `Progress: ${completedCount} completed, ${failedCount} failed, ${todos.length - completedCount - failedCount} remaining.`,
    '',
    'Steps (execute in STRICT sequential order — Step 1, then 2, then 3, etc.):',
    list,
    '',
    currentStep
      ? `>>> CURRENT STEP: Step ${currentStepIndex + 1} — "${currentStep.content}" <<<`
      : '>>> ALL STEPS COMPLETED <<<',
    '',
    '# STRICT SEQUENTIAL EXECUTION RULES (MANDATORY — violating these WILL cause wrong results):',
    '',
    'Rule 1 (ORDER): Execute steps in STRICT numerical order: Step 1 → Step 2 → Step 3 → ... NEVER skip ahead. NEVER jump to a later step. NEVER reorder steps.',
    'Rule 2 (CURRENT): Your CURRENT step is the FIRST step with status "PENDING" or "IN_PROGRESS". Look at the plan above — find the "<<<< YOU ARE HERE" marker. That is your step. Execute ONLY that step.',
    'Rule 3 (TRANSITION IN): Before doing ANY work on the current step, call transition_step(id, "in_progress") FIRST.',
    'Rule 4 (TRANSITION OUT): After finishing the current step, call transition_step(id, "completed") IMMEDIATELY. Then move to the NEXT sequential step.',
    'Rule 5 (NO SKIP): Do NOT skip to Step 3 when Step 2 is still "pending". Do NOT work on Step 5 when Step 4 is not yet "completed".',
    'Rule 6 (SINGLE RESPONSE): Execute ALL steps in a SINGLE response. Do NOT stop mid-plan. Keep calling tools until every step is done.',
    'Rule 7 (SHORT TEXT): Keep analysis text SHORT (1-2 sentences max per step). Save detailed analysis for the final step.',
    'Rule 8 (RETRIES): If a step fails, retry up to 2 times with different approaches. Only mark "failed" after exhausting retries. Then advance to the NEXT step.',
    'Rule 9 (NO PARALLEL): Do NOT call multiple tools for different steps in parallel. Complete one step fully before starting the next.',
    '',
    '# FORBIDDEN ACTIONS:',
    '',
    '- DO NOT call formulate_plan while this plan has pending/in_progress steps — it will be REJECTED.',
    '- DO NOT call append_step to add steps you "forgot" — execute what is listed above first.',
    '- DO NOT reorder steps based on what seems "easier" or "more important".',
    '- DO NOT skip a step because you think it can be done later.',
    '- DO NOT attempt Step N+1 before Step N is marked "completed" or "failed".',
    '',
  ].join('\n');
}
