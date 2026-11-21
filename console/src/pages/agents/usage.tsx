import Page from '@/components/common/page';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { stripPageContextFromTitle } from '@/lib/page-context';
import { cn } from '@/lib/utils';
import {
  formatCost,
  formatTokens,
} from '@/pages/agents/components/turn-stats-panel';
import {
  getAgentsControllerGetUsageQueryKey,
  useAgentsControllerGetUsage,
  type UsageDayDto,
} from '@/services/apis/gen/queries';
import { Link } from '@tanstack/react-router';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { dateFnsLocale } from '@/lib/date-locale';
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { t, useT } from '@/lib/i18n-dictionary';

const RANGES = [7, 30, 90] as const;

/** Fields every usage bucket (summary, day, model, session) carries */
type UsageTotals = Omit<UsageDayDto, 'date'>;

/** Time zone the backend counts days in, so a day matches the user's clock */
const timeZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

/** "$1.20", "≥ $1.20" when some calls had no price, "n/a" when none had */
export function formatUsageCost({
  costUsd,
  costComplete,
}: Pick<UsageTotals, 'costUsd' | 'costComplete'>): string {
  if (costComplete) return formatCost(costUsd);
  return costUsd > 0 ? `≥ ${formatCost(costUsd)}` : t('agents.usage.notAvailable');
}

const totalTokens = (t: UsageTotals) => t.inputTokens + t.outputTokens;

/** Share of input tokens read from the provider's prompt cache: "92%" */
export function formatCacheHit({
  inputTokens,
  cacheReadTokens,
}: Pick<UsageTotals, 'inputTokens' | 'cacheReadTokens'>): string {
  if (inputTokens <= 0) return '—';
  return `${Math.round((cacheReadTokens / inputTokens) * 100)}%`;
}

/**
 * Colour band for a cache-hit ratio: green once the provider serves ≥90% of
 * input tokens from cache, cooling off through amber and red below that.
 */
export function cacheHitTone({
  inputTokens,
  cacheReadTokens,
}: Pick<UsageTotals, 'inputTokens' | 'cacheReadTokens'>): string {
  if (inputTokens <= 0) return 'text-muted-foreground';
  const pct = (cacheReadTokens / inputTokens) * 100;
  if (pct >= 90) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 70) return 'text-lime-600 dark:text-lime-400';
  if (pct >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function StatTile({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border bg-card/50 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tracking-tight',
          valueClassName,
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function DailyChart({ daily }: { daily: UsageDayDto[] }) {
  const t = useT();
  const chartConfig = {
    tokens: { label: t('agents.usage.tokens'), color: 'var(--chart-1)' },
  } satisfies ChartConfig;
  const data = daily.map((day) => ({
    ...day,
    label: format(parseISO(day.date), 'MMM d'),
    tokens: totalTokens(day),
  }));

  return (
    <ChartContainer config={chartConfig} className="h-[220px] w-full">
      {/* right margin keeps the last date label from being clipped */}
      <BarChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickFormatter={(value: number) => formatTokens(value)}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => payload[0]?.payload?.label}
              formatter={(_value, _name, item) => {
                const day = item.payload as (typeof data)[number];
                return (
                  <div className="grid w-full gap-1">
                    {[
                      [t('agents.usage.tokens'), formatTokens(day.tokens)],
                      [t('agents.usage.input'), formatTokens(day.inputTokens)],
                      [t('agents.usage.output'), formatTokens(day.outputTokens)],
                      [t('agents.usage.cacheHit'), formatCacheHit(day)],
                      [t('agents.usage.requests'), String(day.requests)],
                      [t('agents.usage.cost'), formatUsageCost(day)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
          }
        />
        <Bar
          dataKey="tokens"
          fill="var(--color-tokens)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Tokens, cost and sessions the current user spent in AI Studio in this
 * workspace: finished answers and subagent runs of their conversations.
 */
export default function AgentUsagePage() {
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const [days, setDays] = useState<number>(30);
  const params = { days, tz: timeZone };

  const { data, isLoading, isError } = useAgentsControllerGetUsage(params, {
    query: {
      queryKey: [
        ...getAgentsControllerGetUsageQueryKey(params),
        selectedWorkspaceId,
      ],
      enabled: !!selectedWorkspaceId,
    },
  });

  const summary = data?.summary;
  const maxModelTokens = Math.max(
    1,
    ...(data?.models ?? []).map(totalTokens),
  );

  return (
    <Page
      title={t('agents.usage.title')}
      description={t('agents.usage.description')}
      // max-md:pt-10 clears the sidebar trigger floating at the top-left
      className="mx-auto w-full max-w-5xl max-md:pt-10"
      permission="agent.read"
      action={
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger size="sm" className="w-[140px]" aria-label={t('agents.usage.period')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((range) => (
              <SelectItem key={range} value={String(range)}>
                {t('agents.usage.lastDays', { days: range })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="flex flex-col gap-6 pb-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-[94px] animate-pulse rounded-xl border bg-muted/30"
                />
              ))}
            </div>
            <div className="h-[220px] animate-pulse rounded-xl border bg-muted/30" />
          </div>
        ) : isError || !summary ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('agents.usage.loadFailed')}
            </p>
          </div>
        ) : summary.requests === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('agents.usage.empty', { days })}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatTile
                label={t('agents.usage.cost')}
                value={formatUsageCost(summary)}
                hint={
                  summary.costComplete
                    ? t('agents.usage.costEstimated')
                    : t('agents.usage.costIncomplete')
                }
              />
              <StatTile
                label={t('agents.usage.sessions')}
                value={summary.sessions.toLocaleString()}
                hint={t('agents.usage.sessionsHint', { responses: summary.responses, subagentRuns: summary.subagentRuns })}
              />
              <StatTile
                label={t('agents.usage.requests')}
                value={summary.requests.toLocaleString()}
                hint={t('agents.usage.requestsHint')}
              />
              <StatTile
                label={t('agents.usage.inputTokens')}
                value={formatTokens(summary.inputTokens)}
                hint={t('agents.usage.inputTokensHint', { tokens: formatTokens(summary.cacheReadTokens) })}
              />
              <StatTile
                label={t('agents.usage.outputTokens')}
                value={formatTokens(summary.outputTokens)}
                hint={t('agents.usage.outputTokensHint', { tokens: formatTokens(totalTokens(summary)) })}
              />
              <StatTile
                label={t('agents.usage.cacheHit')}
                value={formatCacheHit(summary)}
                valueClassName={cacheHitTone(summary)}
                hint={t('agents.usage.cacheHitHint')}
              />
            </div>

            <Section title={t('agents.usage.tokensPerDay')}>
              <div className="rounded-xl border bg-card/50 p-4">
                <DailyChart daily={data.daily} />
              </div>
            </Section>

            <Section title={t('agents.usage.byModel')}>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium">{t('agents.usage.model')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('agents.usage.requests')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('agents.usage.input')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('agents.usage.output')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('agents.usage.cacheHit')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('agents.usage.cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.models.map((model) => (
                      <tr
                        key={`${model.provider ?? ''}/${model.model}`}
                        className="border-b last:border-0"
                      >
                        <td className="px-3 py-2">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="truncate font-medium">
                              {model.model}
                            </span>
                            {model.provider && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {model.provider}
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 h-1 w-full rounded-full bg-muted">
                            <div
                              className="h-1 rounded-full bg-(--chart-1)"
                              style={{
                                width: `${(totalTokens(model) / maxModelTokens) * 100}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {model.requests.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatTokens(model.inputTokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatTokens(model.outputTokens)}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 text-right font-medium tabular-nums',
                            cacheHitTone(model),
                          )}
                        >
                          {formatCacheHit(model)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatUsageCost(model)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title={t('agents.usage.topSessions')}>
              <div className="flex flex-col divide-y rounded-xl border">
                {data.sessions.map((session) => (
                  <Link
                    key={session.id}
                    to="/aistudio/conversations/$conversationId"
                    params={{ conversationId: session.id }}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {stripPageContextFromTitle(session.title ?? '') ||
                          t('agents.conversations.newConversation')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(session.lastActiveAt), {
                          addSuffix: true,
                          locale: dateFnsLocale(),
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      <p className="font-medium">
                        {t('agents.usage.sessionTokens', {
                          input: formatTokens(session.inputTokens),
                          output: formatTokens(session.outputTokens),
                        })}
                      </p>
                      <p className="text-muted-foreground">
                        <span className={cacheHitTone(session)}>
                          {t('agents.usage.sessionCache', {
                            rate: formatCacheHit(session),
                          })}
                        </span>{' '}
                        · {formatUsageCost(session)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </Section>

            <p className="text-xs text-muted-foreground">
              {t('agents.usage.footnote')}
            </p>
          </>
        )}
      </div>
    </Page>
  );
}
