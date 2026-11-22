import { type TFunction, useT } from '@/lib/i18n-dictionary';
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

type Navigate = ReturnType<typeof useNavigate>;

/** Wording and the page that deals with one insight. */
function describeInsight(
  insight: WorkspaceInsightDto,
  navigate: Navigate,
  t: TFunction,
): { text: string; action: string; onAction: () => void } {
  const { count, days } = insight;
  switch (insight.kind) {
    case WorkspaceInsightKind.critical_open:
      return {
        text: t('dashboard.attention.criticalOpen', { count }),
        action: t('dashboard.attention.review'),
        onAction: () =>
          void navigate({ to: '/vulnerabilities', search: { severity: Severity.critical } }),
      };
    case WorkspaceInsightKind.sla_overdue:
      return {
        text: t('dashboard.attention.slaOverdue', { count }),
        action: t('dashboard.attention.review'),
        onAction: () => void navigate({ to: '/vulnerabilities', search: { overdue: true } }),
      };
    case WorkspaceInsightKind.failed_runs:
      return {
        text: t('dashboard.attention.failedRuns', { count, days: days ?? 7 }),
        action: t('dashboard.attention.jobs'),
        onAction: () => void navigate({ to: '/jobs' }),
      };
    case WorkspaceInsightKind.tls_expiring:
      return {
        text: t('dashboard.attention.tlsExpiring', { count, days: days ?? 30 }),
        action: t('dashboard.attention.seeTls'),
        onAction: () =>
          void navigate({
            to: '/assets',
            search: { tab: 'tls', page: 1, sortBy: 'not_after', sortOrder: 'ASC' },
          }),
      };
    case WorkspaceInsightKind.stale_targets:
      return {
        text: t('dashboard.attention.staleTargets', { count, days: days ?? 30 }),
        action: t('dashboard.attention.targets'),
        onAction: () => void navigate({ to: '/targets' }),
      };
    case WorkspaceInsightKind.pending_review:
      return {
        text: t('dashboard.attention.pendingReview', { count }),
        action: t('dashboard.attention.review'),
        onAction: () =>
          void navigate({
            to: '/vulnerabilities',
            search: { status: VulnerabilityStatus.pending_review },
          }),
      };
    case WorkspaceInsightKind.unscheduled_targets:
    default:
      return {
        text: t('dashboard.attention.unscheduled', { count }),
        action: t('dashboard.attention.targets'),
        onAction: () => void navigate({ to: '/targets' }),
      };
  }
}

/** What the workspace needs acting on, worst first. */
export default function NeedsAttention() {
  const t = useT();
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
          {t('dashboard.attention.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto">
        {isLoading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="my-2 h-7 w-full" />)
        ) : error || !data ? (
          <p className="py-2 text-sm text-muted-foreground">
            {t('dashboard.attention.loadFailed')}
          </p>
        ) : data.insights.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-green-500" />
            {t('dashboard.attention.empty')}
          </p>
        ) : (
          data.insights.map((insight) => {
            const { text, action, onAction } = describeInsight(insight, navigate, t);
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
