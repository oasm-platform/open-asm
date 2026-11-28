import { fromNow } from '@/lib/date-locale';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import type { PendingReport } from './pending-reports';
import { TEMPLATE_META } from './report-meta';

/** Reports queued from this tab, shown until they land in the list. */
export function PendingReportsList({ reports }: { reports: PendingReport[] }) {
  const t = useT();
  if (reports.length === 0) return null;

  return (
    <ul className="divide-y overflow-hidden rounded-lg border" aria-live="polite">
      {reports.map((report) => {
        const meta = TEMPLATE_META[report.template];
        return (
          <li key={report.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className={cn('h-6 w-1 shrink-0 animate-pulse rounded-full', meta.dot)} />
            <span className="font-medium">{t(meta.labelKey)}</span>
            {report.detailKey && (
              <span className="text-muted-foreground">· {t(report.detailKey)}</span>
            )}
            <span className="ml-auto flex items-center gap-2 text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-warning" />
              {t('reports.pending.generating')}
              <span className="hidden sm:inline">· {fromNow(report.queuedAt)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
