import type { ReactNode } from 'react';

/** Right-column card of a detail page: small uppercase title, then rows. */
export function SideCard({
  title,
  action,
  children,
  testId,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-xl border bg-card" data-testid={testId}>
      <header className="flex min-h-11 items-center justify-between gap-2 border-b px-4 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </header>
      <div className="flex flex-col gap-3 px-4 py-3 text-sm">{children}</div>
    </section>
  );
}

/** A titled block of the main column: icon in a quiet tile, optional action. */
export function DetailSection({
  title,
  icon,
  action,
  children,
  testId,
}: {
  title: ReactNode;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="flex flex-col gap-3 px-5 py-5" data-testid={testId}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground [&>svg]:size-4">
            {icon}
          </span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
