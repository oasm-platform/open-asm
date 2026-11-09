import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberAnimate } from '@/components/ui/number-animate';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * A number card, as on the dashboard: title and icon, then the figure with
 * an optional note beside it (`aside`) and content under it (`children`).
 * Clickable when `onClick` is set; `active` marks the view it switches on.
 */
export function StatCard({
  label,
  icon: Icon,
  value,
  aside,
  children,
  tone,
  hint,
  active,
  onClick,
  className,
}: {
  label: string;
  icon: LucideIcon;
  /** A number is animated; a string (`—`, `3 d`) is shown as is. */
  value?: number | string;
  aside?: ReactNode;
  children?: ReactNode;
  /** Text colour of the figure, e.g. red when something is overdue. */
  tone?: string;
  /** Tooltip of the whole card. */
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        'gap-2',
        onClick && 'cursor-pointer transition-colors hover:bg-accent/70',
        active && 'border-primary ring-1 ring-primary/40',
        className,
      )}
      title={hint}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick && active !== undefined ? active : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{label}</CardTitle>
        <Icon className="size-5 text-primary" />
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className={cn('truncate font-mono text-4xl font-bold tabular-nums', tone)}>
            {typeof value === 'number' ? <NumberAnimate value={value} /> : (value ?? '—')}
          </p>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Placeholder of a {@link StatCard} while its number loads. */
export function StatCardSkeleton() {
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-5 rounded-md" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-10 w-16" />
      </CardContent>
    </Card>
  );
}

/** Small muted note beside a figure: the period or policy it covers (`7d`, `SLA 30d`). */
export function StatNote({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="font-mono text-xs text-muted-foreground" title={title}>
      {children}
    </span>
  );
}
