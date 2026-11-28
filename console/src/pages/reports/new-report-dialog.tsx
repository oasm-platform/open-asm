import { CalendarClock, Check, FileText, Repeat } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { CronScheduleBuilder } from '@/components/ui/cron-schedule-builder';
import { DatePickerWithRange } from '@/components/ui/date-picker-range';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import { useAttackSurfaceQueryControllerListSaved } from '@/services/apis/gen/queries';
import {
  EMPTY_DRAFT,
  PERIOD_PRESETS,
  SEVERITY_OPTIONS,
  TEMPLATE_META,
  type ReportDraft,
  type ReportTemplate,
} from './report-meta';
import { ReportTargetPicker } from './report-target-picker';
import { useGenerateReport } from './use-generate-report';

interface NewReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fields to start from, e.g. `{ repeat: true }` from the schedules sheet. */
  initialDraft?: Partial<ReportDraft>;
}

const TEMPLATES: ReportTemplate[] = ['SUMMARY', 'VULNERABILITY', 'QUERY'];

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function NewReportDialog({ open, onOpenChange, initialDraft }: NewReportDialogProps) {
  const t = useT();
  // Callers remount the dialog (`key`) per opening, so each one starts from `initialDraft`.
  const [draft, setDraft] = useState<ReportDraft>({ ...EMPTY_DRAFT, ...initialDraft });
  const { generate, isPending } = useGenerateReport();
  const { data: savedQueries } = useAttackSurfaceQueryControllerListSaved({
    query: { enabled: open && draft.template === 'QUERY' },
  });

  const update = (patch: Partial<ReportDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const isQuery = draft.template === 'QUERY';
  const scheduled = draft.repeat && !isQuery;

  const canSubmit =
    !isPending &&
    (isQuery
      ? Boolean(draft.savedQueryId)
      : scheduled
        ? Boolean(draft.cron)
        : draft.period !== 'custom' || Boolean(draft.customRange?.from));

  const submit = async () => {
    if (await generate(draft)) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{t('reports.actions.newReport')}</DialogTitle>
          <DialogDescription>{t('reports.generate.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Section label={t('reports.generate.template')}>
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
              {TEMPLATES.map((template) => {
                const meta = TEMPLATE_META[template];
                const Icon = meta.icon;
                const selected = draft.template === template;
                return (
                  <button
                    key={template}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      update({
                        template,
                        minSeverity: undefined,
                        repeat: template === 'QUERY' ? false : draft.repeat,
                      })
                    }
                    className={cn(
                      'relative flex flex-col gap-2 rounded-xl border-[1.5px] p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected && 'border-primary bg-primary/5 hover:bg-primary/5',
                    )}
                  >
                    {selected && (
                      <span className="absolute right-2.5 top-2.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-2.5" strokeWidth={3.5} />
                      </span>
                    )}
                    <span className={cn('grid size-8 place-items-center rounded-lg', meta.tone)}>
                      <Icon className="size-4" />
                    </span>
                    <span className="text-sm font-semibold">{t(meta.labelKey)}</span>
                    <span className="text-xs leading-snug text-muted-foreground">
                      {t(meta.descriptionKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {isQuery ? (
            <Section label={t('reports.generate.savedQuery')}>
              <Select
                value={draft.savedQueryId ?? ''}
                onValueChange={(savedQueryId) => update({ savedQueryId })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('reports.generate.savedQueryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(savedQueries ?? []).length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {t('reports.generate.savedQueryEmpty')}
                    </div>
                  ) : (
                    savedQueries?.map((saved) => (
                      <SelectItem key={saved.id} value={saved.id}>
                        {saved.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Section>
          ) : (
            <>
              {/* A scheduled run always covers all data, so it has no period. */}
              {!scheduled && (
                <Section label={t('reports.generate.period')}>
                  <div className="flex flex-wrap gap-1.5">
                    {PERIOD_PRESETS.map((preset) => (
                      <Button
                        key={preset.value}
                        type="button"
                        size="sm"
                        variant={draft.period === preset.value ? 'default' : 'outline'}
                        className="h-8 rounded-full"
                        aria-pressed={draft.period === preset.value}
                        onClick={() => update({ period: preset.value })}
                      >
                        {t(preset.labelKey)}
                      </Button>
                    ))}
                  </div>
                  {draft.period === 'custom' && (
                    <DatePickerWithRange
                      value={draft.customRange}
                      onChange={(customRange) => update({ customRange })}
                      label={t('reports.generate.pickDates')}
                    />
                  )}
                </Section>
              )}

              <Section label={t('reports.generate.targets')} hint={t('reports.generate.targetsHint')}>
                <ReportTargetPicker
                  value={draft.targetIds}
                  onChange={(targetIds) => update({ targetIds })}
                />
              </Section>

              {draft.template === 'VULNERABILITY' && (
                <Section
                  label={t('reports.generate.minSeverity')}
                  hint={t('reports.generate.minSeverityHint')}
                >
                  <SeverityThreshold
                    value={draft.minSeverity}
                    onChange={(minSeverity) => update({ minSeverity })}
                  />
                </Section>
              )}
            </>
          )}

          <Section label={t('reports.generate.delivery')}>
            <div role="radiogroup" className="overflow-hidden rounded-xl border">
              <DeliveryOption
                selected={!draft.repeat}
                icon={FileText}
                title={t('reports.generate.now')}
                description={t('reports.generate.nowHint')}
                onSelect={() => update({ repeat: false })}
              />
              <DeliveryOption
                selected={scheduled}
                disabled={isQuery}
                icon={Repeat}
                title={t('reports.generate.schedule')}
                description={
                  isQuery ? t('reports.generate.queryNoSchedule') : t('reports.generate.scheduleHint')
                }
                onSelect={() => update({ repeat: true })}
              >
                {scheduled && (
                  <div className="pt-3">
                    <CronScheduleBuilder onChange={(change) => update({ cron: change.cron })} />
                  </div>
                )}
              </DeliveryOption>
            </div>
          </Section>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {scheduled ? <CalendarClock className="size-4" /> : <FileText className="size-4" />}
            {isPending
              ? t('reports.generate.generating')
              : scheduled
                ? t('reports.generate.saveSchedule')
                : t('reports.generate.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SeverityThreshold({
  value,
  onChange,
}: {
  value?: ReportDraft['minSeverity'];
  onChange: (value: ReportDraft['minSeverity']) => void;
}) {
  const t = useT();
  const selectedIndex = SEVERITY_OPTIONS.findIndex((option) => option.value === value);
  return (
    <div role="radiogroup" className="grid grid-cols-5 overflow-hidden rounded-lg border">
      <button
        type="button"
        role="radio"
        aria-checked={!value}
        onClick={() => onChange(undefined)}
        className={cn(
          'h-9 border-r text-sm text-muted-foreground transition-colors hover:bg-accent',
          !value && 'bg-accent font-medium text-foreground',
        )}
      >
        {t('reports.generate.minSeverityAny')}
      </button>
      {SEVERITY_OPTIONS.map((option, index) => {
        // Every level at or above the threshold is part of the report.
        const included = selectedIndex >= 0 && index <= selectedIndex;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-9 items-center justify-center gap-1.5 border-r text-sm text-muted-foreground transition-colors last:border-r-0 hover:bg-accent',
              included && 'bg-accent text-foreground',
              option.value === value && 'font-medium',
            )}
          >
            <span className={cn('size-1.5 rounded-full', option.color)} />
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

function DeliveryOption({
  selected,
  disabled,
  icon: Icon,
  title,
  description,
  onSelect,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: typeof FileText;
  title: string;
  description: string;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'flex gap-3 border-b p-3.5 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        selected && 'bg-primary/5',
      )}
    >
      <span
        className={cn(
          'mt-0.5 size-4 shrink-0 rounded-full border-[1.5px] border-input',
          selected && 'border-[5px] border-primary',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        {/* The schedule builder's own clicks must not re-select the option. */}
        <div onClick={(e) => e.stopPropagation()}>{children}</div>
      </div>
    </div>
  );
}
