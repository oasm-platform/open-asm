import { useT } from '@/lib/i18n-dictionary';
import { ChevronRight } from 'lucide-react';
import { Fragment, memo } from 'react';

/** A pipeline read left to right: each step's tools, then an arrow. */
export const PipelineSteps = memo(function PipelineSteps({
  steps,
}: {
  steps: string[][];
}) {
  const t = useT();
  if (steps.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">{t('projects.pipelineSteps.noTools')}</span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t('projects.pipeline')}>
      {steps.map((tools, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
          <span className="flex flex-wrap gap-1">
            {tools.map((tool) => (
              <span
                key={tool}
                className="rounded-md border bg-muted/50 px-2 py-0.5 text-xs font-medium"
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
