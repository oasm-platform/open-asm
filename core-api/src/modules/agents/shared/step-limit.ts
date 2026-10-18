import type { PrepareStepFunction, ToolSet } from 'ai';
import { isStepCount } from 'ai';

/** Steps of a tool loop when neither the agent nor the user config sets one. */
export const DEFAULT_MAX_STEPS = 50;

const FINAL_STEP_NOTE =
  'Step limit reached: no more tool calls. Answer now from what you already have, and say what is left unfinished.';

/**
 * Caps a tool loop at `maxSteps` steps.
 *
 * With `forceSummary` (the default), the last step gets no tools, so the model
 * must write an answer instead of ending on a bare tool call. That is right for
 * a single-shot run that will not continue.
 *
 * The continuation loop passes `forceSummary: false` for its ongoing
 * iterations: it needs the step that hit the cap to keep its natural
 * finishReason (`tool-calls`) so it can tell the model was still working and
 * open another iteration. It forces the summary only on the iteration it knows
 * is the last one.
 */
export function stepLimit(
  maxSteps: number,
  { forceSummary = true }: { forceSummary?: boolean } = {},
) {
  const stopWhen = isStepCount(maxSteps);
  if (!forceSummary) return { stopWhen };

  const prepareStep: PrepareStepFunction<ToolSet> = ({
    stepNumber,
    instructions,
  }) => {
    if (stepNumber < maxSteps - 1) return {};
    const system =
      instructions === undefined
        ? []
        : typeof instructions === 'string'
          ? [{ role: 'system' as const, content: instructions }]
          : Array.isArray(instructions)
            ? instructions
            : [instructions];
    return {
      toolChoice: 'none',
      instructions: [...system, { role: 'system', content: FINAL_STEP_NOTE }],
    };
  };
  return { stopWhen, prepareStep };
}
