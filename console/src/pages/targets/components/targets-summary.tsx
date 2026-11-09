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
        label="Targets"
        value={data?.total}
        icon={Crosshair}
        hint="In this workspace"
        active={view === 'all'}
        onClick={() => onViewChange('all')}
      />
      <StatCard
        label="Scanning"
        value={data?.scanning}
        icon={Radar}
        hint="With jobs running"
        active={view === 'scanning'}
        onClick={() => toggle('scanning')}
      />
      <StatCard
        label="With critical"
        value={data?.withCritical}
        icon={ShieldAlert}
        hint="Open critical vulnerability"
        active={view === 'critical'}
        onClick={() => toggle('critical')}
      />
      <StatCard
        label="Stale"
        value={data?.stale}
        icon={History}
        hint={`Not discovered in ${STALE_DAYS} days`}
        active={view === 'stale'}
        onClick={() => toggle('stale')}
      />
      <StatCard
        label="Scheduled"
        value={data?.scheduled}
        icon={CalendarClock}
        hint="Rescanned automatically"
      />
    </div>
  );
}
