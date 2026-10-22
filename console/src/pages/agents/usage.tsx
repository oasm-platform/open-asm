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
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

const RANGES = [7, 30, 90] as const;

/** Fields every usage bucket (summary, day, model, session) carries */
type UsageTotals = Omit<UsageDayDto, 'date'>;

const chartConfig = {
  tokens: { label: 'Tokens', color: 'var(--chart-1)' },
} satisfies ChartConfig;

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
  return costUsd > 0 ? `≥ ${formatCost(costUsd)}` : 'n/a';
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
                      ['Tokens', formatTokens(day.tokens)],
                      ['Input', formatTokens(day.inputTokens)],
                      ['Output', formatTokens(day.outputTokens)],
                      ['Cache hit', formatCacheHit(day)],
                      ['Requests', String(day.requests)],
                      ['Cost', formatUsageCost(day)],
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
      title="Usage"
      description="Tokens, cost and sessions you used in this workspace"
      // max-md:pt-10 clears the sidebar trigger floating at the top-left
      className="mx-auto w-full max-w-5xl max-md:pt-10"
      permission="agent.read"
      action={
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger size="sm" className="w-[140px]" aria-label="Usage period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((range) => (
              <SelectItem key={range} value={String(range)}>
                Last {range} days
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
              Could not load usage. Try again later.
            </p>
          </div>
        ) : summary.requests === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No AI Studio usage in the last {days} days.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatTile
                label="Cost"
                value={formatUsageCost(summary)}
                hint={
                  summary.costComplete
                    ? 'Estimated from model prices'
                    : 'Some models have no known price'
                }
              />
              <StatTile
                label="Sessions"
                value={summary.sessions.toLocaleString()}
                hint={`${summary.responses} answers · ${summary.subagentRuns} subagent runs`}
              />
              <StatTile
                label="Requests"
                value={summary.requests.toLocaleString()}
                hint="Model calls"
              />
              <StatTile
                label="Input tokens"
                value={formatTokens(summary.inputTokens)}
                hint={`${formatTokens(summary.cacheReadTokens)} read from cache`}
              />
              <StatTile
                label="Output tokens"
                value={formatTokens(summary.outputTokens)}
                hint={`${formatTokens(totalTokens(summary))} tokens in total`}
              />
              <StatTile
                label="Cache hit"
                value={formatCacheHit(summary)}
                valueClassName={cacheHitTone(summary)}
                hint="Of input tokens, served from cache"
              />
            </div>

            <Section title="Tokens per day">
              <div className="rounded-xl border bg-card/50 p-4">
                <DailyChart daily={data.daily} />
              </div>
            </Section>

            <Section title="By model">
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium">Model</th>
                      <th className="px-3 py-2 text-right font-medium">Requests</th>
                      <th className="px-3 py-2 text-right font-medium">Input</th>
                      <th className="px-3 py-2 text-right font-medium">Output</th>
                      <th className="px-3 py-2 text-right font-medium">Cache hit</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
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

            <Section title="Top sessions">
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
                        {session.title ?? 'New conversation'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(session.lastActiveAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      <p className="font-medium">
                        {formatTokens(session.inputTokens)} in ·{' '}
                        {formatTokens(session.outputTokens)} out
                      </p>
                      <p className="text-muted-foreground">
                        <span className={cacheHitTone(session)}>
                          {formatCacheHit(session)} cache
                        </span>{' '}
                        · {formatUsageCost(session)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </Section>

            <p className="text-xs text-muted-foreground">
              Your finished answers and subagent runs in this workspace. Stopped
              answers are not counted.
            </p>
          </>
        )}
      </div>
    </Page>
  );
}
