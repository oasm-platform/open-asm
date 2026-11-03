import { ChevronRight } from 'lucide-react';
import { Fragment, memo } from 'react';

/** A pipeline read left to right: each step's tools, then an arrow. */
export const PipelineSteps = memo(function PipelineSteps({
  steps,
}: {
  steps: string[][];
}) {
  if (steps.length === 0) {
    return <span className="text-xs text-muted-foreground">No tools</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Pipeline">
      {steps.map((tools, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
          <span className="flex flex-wrap gap-1">
            {tools.map((tool) => (
              <span
                key={tool}
                className="rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs"
              >
                {tool}
              </span>
            ))}
          </span>
        </Fragment>
      ))}
    </div>
  );
});
