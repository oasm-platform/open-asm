import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

// Shared layout of the side panel tabs, so they all line up the same: the
// tab content pads by px-3, rows by px-2 and lead with a size-4 icon, so
// every icon and every line of text starts at the same x in every tab.

/** One row: size-4 leading icon, text-sm text, hover tint across the row */
export const SIDE_PANEL_ROW =
  'flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm';

/** Indent that lines content up with a row's text (px-2 + icon + gap) */
export const SIDE_PANEL_INDENT = 'pl-8.5';

/** A titled block of a tab: small caps title, optional meta on the right */
export function SidePanelSection({
  title,
  meta,
  children,
  className,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-1.5', className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>{title}</span>
          {meta && (
            <span className="normal-case tracking-normal tabular-nums">
              {meta}
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
