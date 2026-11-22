import { useT } from '@/lib/i18n-dictionary';
import { StatCard } from '@/components/common/stat-card';
import { useTargetsControllerGetTargetsSummary } from '@/services/apis/gen/queries';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  CalendarClock,
  Crosshair,
  History,
  Radar,
  ShieldAlert,
} from 'lucide-react';
import { STALE_DAYS } from '../target-utils';

/** A quick view of the list the strip can switch on. */
export type TargetView = 'all' | 'scanning' | 'critical' | 'stale';

/** Counts above the target list; the clickable ones switch its quick view. */
export function TargetsSummary({
  view,
  onViewChange,
}: {
  view: TargetView;
  onViewChange: (view: TargetView) => void;
}) {
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data } = useTargetsControllerGetTargetsSummary({
    query: {
      refetchInterval: 10_000,
      queryKey: ['targets', 'summary', selectedWorkspaceId],
    },
  });
  const toggle = (next: TargetView) =>
    onViewChange(view === next ? 'all' : next);

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label={t('targets.summary.targets')}
        value={data?.total}
        icon={Crosshair}
        hint={t('targets.summary.inWorkspace')}
        active={view === 'all'}
        onClick={() => onViewChange('all')}
      />
      <StatCard
        label={t('targets.summary.scanning')}
        value={data?.scanning}
        icon={Radar}
        hint={t('targets.summary.withJobs')}
        active={view === 'scanning'}
        onClick={() => toggle('scanning')}
      />
      <StatCard
        label={t('targets.summary.withCritical')}
        value={data?.withCritical}
        icon={ShieldAlert}
        hint={t('targets.summary.openCritical')}
        active={view === 'critical'}
        onClick={() => toggle('critical')}
      />
      <StatCard
        label={t('targets.summary.stale')}
        value={data?.stale}
        icon={History}
        hint={t('targets.summary.notDiscovered', { days: STALE_DAYS })}
        active={view === 'stale'}
        onClick={() => toggle('stale')}
      />
      <StatCard
        label={t('targets.summary.scheduled')}
        value={data?.scheduled}
        icon={CalendarClock}
        hint={t('targets.summary.rescanned')}
      />
    </div>
  );
}
