import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import { TEMPLATE_META, type ReportDraft, type ReportTemplate } from './report-meta';

const STARTERS: ReportTemplate[] = ['SUMMARY', 'VULNERABILITY'];

/** First visit: no report yet, so offer the two builtin templates instead of an empty table. */
export function ReportsEmptyState({ onStart }: { onStart: (draft: Partial<ReportDraft>) => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-6 rounded-xl bg-muted/30 px-6 py-14 text-center">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('reports.emptyState.title')}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t('reports.emptyState.description')}</p>
      </div>
      <div className="grid w-full max-w-xl gap-3 sm:grid-cols-2">
        {STARTERS.map((template) => {
          const meta = TEMPLATE_META[template];
          return (
            <button
              key={template}
              type="button"
              onClick={() => onStart({ template })}
              className="flex flex-col gap-1.5 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn('size-2 rounded-full', meta.dot)} />
                {t(meta.labelKey)}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                {t(meta.descriptionKey)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
