import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberAnimate } from '@/components/ui/number-animate';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useVulnerabilitiesControllerGetSettings,
  type GetVulnerabilitiesStatisticsResponseDto,
} from '@/services/apis/gen/queries';
import {
  AlarmClock,
  CircleCheck,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Timer,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface StatsStripProps {
  stats?: GetVulnerabilitiesStatisticsResponseDto;
  isLoading?: boolean;
}

/** Number card styled like the dashboard totals: title and icon, then a large figure. */
function Stat({
  label,
  icon,
  value,
  hint,
  tone,
}: {
  label: string;
  icon: ReactNode;
  value: string | number;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{label}</CardTitle>
        <span className="text-primary [&>svg]:size-5">{icon}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className={cn('text-4xl font-bold font-mono', tone)}>
          {typeof value === 'number' ? <NumberAnimate value={value} /> : value}
        </p>
        <span className="min-h-4 truncate text-xs text-muted-foreground">
          {hint}
        </span>
      </CardContent>
    </Card>
  );
}

/**
 * Lifecycle numbers above the list: new in 7 days, open, resurfaced and fixed
 * in 30 days, overdue, and mean time to remediate high findings.
 */
export function VulnerabilityStatsStrip({ stats, isLoading }: StatsStripProps) {
  const { data: settings } = useVulnerabilitiesControllerGetSettings();

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
        data-testid="vuln-stats-loading"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="gap-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-5 rounded-md" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-10 w-16" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-sm text-muted-foreground">No statistics available.</p>
    );
  }

  const bySeverity = Object.fromEntries(
    (stats.data ?? []).map((s) => [s.severity, s.count]),
  );
  const open = (stats.data ?? []).reduce((sum, s) => sum + s.count, 0);
  const mttrHigh = stats.mttr?.find((m) => m.severity === 'high');
  const slaHigh = settings?.slaDays.high;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <Stat
        label="New (7 days)"
        icon={<Sparkles />}
        value={stats.newLast7Days}
      />
      <Stat
        label="Open"
        icon={<ShieldAlert />}
        value={open}
        hint={`${bySeverity.critical ?? 0} critical · ${bySeverity.high ?? 0} high`}
      />
      <Stat
        label="Resurfaced"
        icon={<RotateCcw />}
        value={stats.resurfacedLast30Days}
        hint="in 30 days"
      />
      <Stat
        label="Fixed"
        icon={<CircleCheck />}
        value={stats.fixedLast30Days}
        hint="in 30 days"
      />
      <Stat
        label="SLA overdue"
        icon={<AlarmClock />}
        value={stats.overdue}
        tone={stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : undefined}
      />
      <Stat
        label="MTTR high"
        icon={<Timer />}
        value={mttrHigh?.days != null ? `${Math.round(mttrHigh.days)} d` : '—'}
        hint={slaHigh ? `SLA ${slaHigh} days` : 'last 90 days'}
      />
    </div>
  );
}
