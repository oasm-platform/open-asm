import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ConversationMetadataDto } from '@/services/apis/gen/queries';
import { BarChart3, ChevronDown, Cpu } from 'lucide-react';
import { memo, useState } from 'react';
import { SIDE_PANEL_ROW, SidePanelSection } from './side-panel-layout';
import { t, useT } from '@/lib/i18n-dictionary';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 1234 -> "1.2K" */
export function formatTokens(value: number | null | undefined): string {
  return compact.format(value ?? 0);
}

/** 850 -> "850ms", 4_200 -> "4s", 249_000 -> "4m9s"; whole seconds only */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  // Rounded once, so 59.6 s reads "1m0s", never "60s" or "0m60s"
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

export function formatCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return t('agents.usage.notAvailable');
  if (usd === 0) return '$0';
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

const formatRate = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `~${Math.round(v)} tok/s`;

/** Dictionary keys of where the context window size came from */
const WINDOW_SOURCE_LABEL: Record<string, string> = {
  manual: 'agents.stats.source.manual',
  catalog: 'agents.stats.source.catalog',
  default: 'agents.stats.source.default',
};

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums text-foreground', className)}>
        {value}
      </span>
    </div>
  );
}

interface TurnStatsPanelProps {
  metadata: ConversationMetadataDto | null | undefined;
  /**
   * False lays it out for a side panel tab: no card, nothing folds, the
   * tab's sections and rows. Default true
   */
  collapsible?: boolean;
  className?: string;
}

/**
 * Context window usage of the current model and the stats of the latest
 * turn (throughput, model/tool time, tokens, cache hits, cost).
 */
export const TurnStatsPanel = memo(function TurnStatsPanel({
  metadata,
  collapsible = true,
  className,
}: TurnStatsPanelProps) {
  const t = useT();
  const [open, setOpen] = useState(true);
  if (!metadata?.model && !metadata?.lastTurn) return null;

  const contextWindow = metadata.contextWindow ?? 0;
  const used = metadata.contextUsedTokens ?? 0;
  const percent = contextWindow > 0 ? Math.min(100, (used / contextWindow) * 100) : 0;
  const turn = metadata.lastTurn;
  const totals = metadata.totals;
  const sourceKey = WINDOW_SOURCE_LABEL[metadata.contextWindowSource ?? ''];
  const sourceLabel = sourceKey ? t(sourceKey) : '';
  const estimated =
    metadata.catalogEstimated || metadata.contextWindowSource === 'default';
  const turnRows = turn && (
    <>
      <Row label={t('agents.stats.response')} value={formatRate(turn.responseTokPerSec)} />
      <Row label={t('agents.stats.wholeTurn')} value={formatRate(turn.turnTokPerSec)} />
      <Row label={t('agents.stats.modelTime')} value={formatDuration(turn.modelTimeMs)} />
      <Row label={t('agents.stats.toolTime')} value={formatDuration(turn.toolTimeMs)} />
      {turn.subagentWaitMs > 0 && (
        <Row
          label={t('agents.stats.subagentWait')}
          value={formatDuration(turn.subagentWaitMs)}
        />
      )}
      <Row label={t('agents.stats.avgTtft')} value={formatDuration(turn.avgTtftMs)} />
      <Row label={t('agents.stats.steps')} value={String(turn.steps)} />
      <Row
        label={t('agents.stats.tokens')}
        value={`${formatTokens(turn.inputTokens)} ↑ · ${formatTokens(turn.outputTokens)} ↓`}
      />
      <Row
        label={t('agents.stats.cache')}
        value={`${Math.round(turn.cachePercent)}%`}
        className={turn.cachePercent >= 50 ? 'text-emerald-500' : undefined}
      />
      <Row label={t('agents.stats.cost')} value={formatCost(turn.costUsd)} />
      {totals && totals.turns > 1 && (
        <Row
          label={t('agents.stats.total', { count: totals.turns })}
          value={`${totals.costComplete ? '' : '≥ '}${formatCost(totals.costUsd)}`}
        />
      )}
    </>
  );

  if (!collapsible) {
    // Side panel tab: the same sections and rows as the other tabs
    return (
      <div className={cn('space-y-5', className)}>
        {metadata.model && (
          <SidePanelSection
            title={t('agents.stats.context')}
            meta={
              contextWindow > 0 && (
                <span className={cn(percent >= 80 && 'text-amber-500')}>
                  {t('agents.stats.percentUsed', { percent: Math.round(percent) })}
                </span>
              )
            }
          >
            <div
              className={cn(SIDE_PANEL_ROW, 'items-center')}
              title={`${metadata.provider ?? ''} ${metadata.model}`.trim()}
            >
              <Cpu className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{metadata.model}</span>
            </div>
            <div className="space-y-1.5 px-2">
              <Progress
                value={percent}
                className="h-1.5"
                aria-label={t('agents.stats.contextUsed')}
              />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {t('agents.stats.contextTokens', {
                    used: formatTokens(used),
                    window: `${estimated ? '~' : ''}${formatTokens(contextWindow)}`,
                  })}
                </span>
                {sourceLabel && <span className="truncate">{sourceLabel}</span>}
              </div>
            </div>
          </SidePanelSection>
        )}
        {turn && (
          <SidePanelSection
            title={t('agents.stats.turnStats')}
            meta={formatRate(turn.responseTokPerSec)}
          >
            {/* Each Row padded as a side panel row */}
            <div className="text-sm [&>div]:rounded-lg [&>div]:px-2 [&>div]:py-1.5">
              {turnRows}
            </div>
          </SidePanelSection>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'shrink-0 rounded-xl border border-border bg-card px-3 py-2.5 text-xs shadow-xs',
        className,
      )}
    >
      {metadata.model && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span
              className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground"
              title={`${metadata.provider ?? ''} ${metadata.model}`.trim()}
            >
              <Cpu className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{metadata.model}</span>
            </span>
            <span
              className={cn(
                'shrink-0 tabular-nums font-medium',
                percent >= 80 ? 'text-amber-500' : 'text-muted-foreground',
              )}
            >
              {contextWindow > 0 ? `${Math.round(percent)}%` : '—'}
            </span>
          </div>
          <Progress
            value={percent}
            className="h-1.5"
            aria-label={t('agents.stats.contextUsed')}
          />
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span className="tabular-nums">
              {t('agents.stats.contextTokens', {
                used: formatTokens(used),
                window: `${estimated ? '~' : ''}${formatTokens(contextWindow)}`,
              })}
            </span>
            {sourceLabel && <span className="truncate">{sourceLabel}</span>}
          </div>
        </div>
      )}

      {turn && (
        <Collapsible
          open={open}
          onOpenChange={setOpen}
          className={cn(metadata.model && 'mt-2.5 border-t pt-1.5')}
        >
          <CollapsibleTrigger className="flex w-full items-center gap-2 py-1 text-sm font-medium text-foreground cursor-pointer">
            <BarChart3 className="size-4 text-muted-foreground" />
            <span>{t('agents.stats.turnStats')}</span>
            <ChevronDown
              className={cn(
                'size-3.5 text-muted-foreground transition-transform',
                !open && '-rotate-90',
              )}
            />
            <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
              {formatRate(turn.responseTokPerSec)}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            {turnRows}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
});
