import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import { useAttackSurfaceQueryControllerListSaved } from '@/services/apis/gen/queries';
import { EMPTY_DRAFT, TEMPLATE_META, type ReportDraft } from './report-meta';
import { useGenerateReport } from './use-generate-report';

interface NewReportMenuProps {
  /** Opens the full dialog. */
  onCustomize: () => void;
  disabled?: boolean;
}

/** One-click drafts: queued straight away, no dialog. */
const QUICK_DRAFTS: { labelKey: string; draft: ReportDraft }[] = [
  {
    labelKey: 'reports.quick.summaryLast7Days',
    draft: { ...EMPTY_DRAFT, template: 'SUMMARY', period: '7d' },
  },
  {
    labelKey: 'reports.quick.summaryLastMonth',
    draft: { ...EMPTY_DRAFT, template: 'SUMMARY', period: 'lastMonth' },
  },
  {
    labelKey: 'reports.quick.vulnerabilityHigh',
    draft: { ...EMPTY_DRAFT, template: 'VULNERABILITY', period: 'all', minSeverity: 'HIGH' },
  },
];

const SAVED_QUERIES_SHOWN = 5;

export function NewReportMenu({ onCustomize, disabled }: NewReportMenuProps) {
  const t = useT();
  const { generate, isPending } = useGenerateReport();
  const { data: savedQueries } = useAttackSurfaceQueryControllerListSaved();

  return (
    <ButtonGroup>
      <Button onClick={onCustomize} disabled={disabled}>
        {t('reports.actions.newReport')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            disabled={disabled || isPending}
            aria-label={t('reports.actions.moreOptions')}
            className="border-l border-primary-foreground/25"
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t('reports.quick.title')}
          </DropdownMenuLabel>
          {QUICK_DRAFTS.map(({ labelKey, draft }) => (
            <DropdownMenuItem key={labelKey} onSelect={() => void generate(draft)}>
              <span className={cn('size-2 shrink-0 rounded-full', TEMPLATE_META[draft.template].dot)} />
              {t(labelKey)}
            </DropdownMenuItem>
          ))}
          {savedQueries && savedQueries.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t('reports.quick.fromSavedQuery')}
              </DropdownMenuLabel>
              {savedQueries.slice(0, SAVED_QUERIES_SHOWN).map((saved) => (
                <DropdownMenuItem
                  key={saved.id}
                  onSelect={() =>
                    void generate({ ...EMPTY_DRAFT, template: 'QUERY', savedQueryId: saved.id })
                  }
                >
                  <span className={cn('size-2 shrink-0 rounded-full', TEMPLATE_META.QUERY.dot)} />
                  <span className="truncate">{saved.name}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onCustomize}>
            {t('reports.quick.custom')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
