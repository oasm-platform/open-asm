import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { cn } from '@/lib/utils';
import {
  InsightLevel,
  Severity,
  useStatisticControllerGetAttention,
  VulnerabilityStatus,
  WorkspaceInsightKind,
  type WorkspaceInsightDto,
} from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Info,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

const LEVEL_STYLE: Record<InsightLevel, { icon: LucideIcon; className: string }> = {
  [InsightLevel.critical]: { icon: ShieldAlert, className: 'text-red-500' },
  [InsightLevel.warning]: { icon: AlertTriangle, className: 'text-amber-500' },
  [InsightLevel.info]: { icon: Info, className: 'text-sky-500' },
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

type Navigate = ReturnType<typeof useNavigate>;

/** Wording and the page that deals with one insight. */
function describeInsight(
  insight: WorkspaceInsightDto,
  navigate: Navigate,
): { text: string; action: string; onAction: () => void } {
  const { count, days } = insight;
  switch (insight.kind) {
    case WorkspaceInsightKind.critical_open:
      return {
        text: plural(count, 'open critical vulnerability', 'open critical vulnerabilities'),
        action: 'Review',
        onAction: () =>
          void navigate({ to: '/vulnerabilities', search: { severity: Severity.critical } }),
      };
    case WorkspaceInsightKind.sla_overdue:
      return {
        text: `${plural(count, 'vulnerability', 'vulnerabilities')} past their SLA`,
        action: 'Review',
        onAction: () => void navigate({ to: '/vulnerabilities', search: { overdue: true } }),
      };
    case WorkspaceInsightKind.failed_runs:
      return {
        text: `${plural(count, 'run')} with a failed job in the last ${days ?? 7} days`,
        action: 'Jobs',
        onAction: () => void navigate({ to: '/jobs' }),
      };
    case WorkspaceInsightKind.tls_expiring:
      return {
        text: `${plural(count, 'TLS certificate')} expired or expiring within ${days ?? 30} days`,
        action: 'See TLS',
        onAction: () =>
          void navigate({
            to: '/assets',
            search: { tab: 'tls', page: 1, sortBy: 'not_after', sortOrder: 'ASC' },
          }),
      };
    case WorkspaceInsightKind.stale_targets:
      return {
        text: `${plural(count, 'target')} not discovered for ${days ?? 30} days`,
        action: 'Targets',
        onAction: () => void navigate({ to: '/targets' }),
      };
    case WorkspaceInsightKind.pending_review:
      return {
        text: `${plural(count, 'AI finding')} waiting for review`,
        action: 'Review',
        onAction: () =>
          void navigate({
            to: '/vulnerabilities',
            search: { status: VulnerabilityStatus.pending_review },
          }),
      };
    case WorkspaceInsightKind.unscheduled_targets:
    default:
      return {
        text: `${plural(count, 'target')} without a scan schedule`,
        action: 'Targets',
        onAction: () => void navigate({ to: '/targets' }),
      };
  }
}

/** What the workspace needs acting on, worst first. */
export default function NeedsAttention() {
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading, error } = useStatisticControllerGetAttention({
    query: {
      queryKey: ['statistic-attention', selectedWorkspaceId],
      refetchInterval: 60_000,
    },
  });

  return (
    <Card className="h-[26rem]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-primary" />
          Needs attention
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto">
        {isLoading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="my-2 h-7 w-full" />)
        ) : error || !data ? (
          <p className="py-2 text-sm text-muted-foreground">
            Could not load what needs attention.
          </p>
        ) : data.insights.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-green-500" />
            Nothing needs attention.
          </p>
        ) : (
          data.insights.map((insight) => {
            const { text, action, onAction } = describeInsight(insight, navigate);
            const { icon: Icon, className } = LEVEL_STYLE[insight.level];
            return (
              <div key={insight.kind} className="flex items-center gap-3 py-2.5 text-sm">
                <Icon className={cn('size-4 shrink-0', className)} />
                <span className="min-w-0 flex-1">{text}</span>
                <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={onAction}>
                  {action}
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
