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

/**
 * The goal of the plan, pinned above it while any step is unfinished so
 * every iteration of a long run keeps working toward the same outcome.
 */
function formatGoal(goal: string, finished: boolean): string {
  return finished
    ? [
        '# GOAL OF THE FINISHED PLAN:',
        goal,
        'Your final answer must say whether this goal was met, with the evidence. A new request needs a new goal and plan (formulate_plan).',
      ].join('\n')
    : [
        '# PINNED GOAL (stays pinned until every step is completed or failed):',
        goal,
        'Every step, tool call and answer must move toward this goal. Do not drift into unrelated work. If the user changes the goal, call scrap_plan, then formulate_plan with the new goal.',
      ].join('\n');
}

export function formatTodosToPrompt(
  todos: AgentTodoItem[],
  goal?: string | null,
): string {
  if (!todos || todos.length === 0) {
    return 'No specific plan has been set up yet.';
  }

  const completedCount = todos.filter((t) => t.status === 'completed').length;
  const failedCount = todos.filter((t) => t.status === 'failed').length;
  const currentStep = todos.find(
    (t) => t.status === 'pending' || t.status === 'in_progress',
  );
  const currentStepIndex = currentStep ? todos.indexOf(currentStep) : -1;

  const list = todos
    .map((t, index) => {
      const isCurrent = index === currentStepIndex;
      const marker = isCurrent ? ' <<<< YOU ARE HERE' : '';
      return `${STATUS_SYMBOLS[t.status]} Step ${index + 1}: ${t.content} (${t.status.toUpperCase()})${marker}`;
    })
    .join('\n');

  return [
    '',
    ...(goal ? [formatGoal(goal, !currentStep), ''] : []),
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
    '# HOW TO WORK THROUGH THE PLAN:',
    '',
    'Rule 1 (ORDER): Steps run in order. Your current step is the one marked "<<<< YOU ARE HERE"; the system only lets you start the first unfinished step.',
    'Rule 2 (TRANSITIONS): Call transition_step(id, "in_progress") before working on a step and transition_step(id, "completed") (or "failed") as soon as it is done, then start the next one.',
    'Rule 3 (PARALLEL INSIDE A STEP): Within the current step, independent tool calls may run in parallel (e.g. several lookups, or dispatching several subagents at once).',
    'Rule 4 (DELEGATE): A step that matches a subagent is done by dispatching it. A dispatch step is completed once every subagent it needs has been dispatched; do not wait for the results there. Check the results in a later step (they are delivered to you automatically) and judge them against the goal.',
    "Rule 5 (KEEP GOING): Work through the steps without stopping to ask, unless a decision is really the user's (scope change, risky action).",
    'Rule 6 (SHORT TEXT): Keep text between steps to 1-2 sentences. Save detailed analysis for the final step.',
    'Rule 7 (FAILURES): If a step fails, try one or two other approaches, then mark it "failed" with the reason and move on.',
    '',
    '# PLAN CHANGES:',
    '',
    '- formulate_plan is rejected while this plan has pending/in_progress steps.',
    '- If the user cancels or replaces the task, call scrap_plan first — that is the ONLY way to drop this plan.',
    '- Work the goal needs that you discover on the way: append_step (Agent mode). Do not reorder or skip steps.',
    '',
  ].join('\n');
}
