import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TlsStatisticsSkeleton } from './dashboard-skeleton';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetTlsStatistics } from '@/services/apis/gen/queries';
import { format } from 'date-fns';
import { useNavigate } from '@tanstack/react-router';

const TlsStatistics = () => {
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading, error } = useStatisticControllerGetTlsStatistics({
    query: {
      queryKey: ['tls-statistics', selectedWorkspaceId],
    },
  });

  const handleNavigate = (startDate?: Date, endDate?: Date) => {
    navigate({
      to: '/assets',
      search: {
        tab: 'tls',
        page: 1,
        sortBy: 'not_after',
        sortOrder: 'ASC',
        ...(startDate ? { startDate: format(startDate, 'yyyy-MM-dd') } : {}),
        ...(endDate ? { endDate: format(endDate, 'yyyy-MM-dd') } : {}),
      },
    });
  };

  if (isLoading) return <TlsStatisticsSkeleton />;

  if (error || !data) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Certificates</CardTitle>
        </CardHeader>
        <CardContent className="text-destructive">Couldn&apos;t load data</CardContent>
      </Card>
    );
  }

  const today = new Date();
  const oneMonthLater = new Date(today);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  const threeMonthsLater = new Date(today);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  // Expiry buckets split every certificate once; "new" overlaps them, so it
  // is shown beside the bar rather than as a segment of it.
  const items = [
    { label: 'Expired', value: data.alreadyExpired, color: 'bg-red-400', endDate: today },
    { label: 'Expires within a month', value: data.expireInAMonth, color: 'bg-orange-300', startDate: today, endDate: oneMonthLater },
    { label: 'Expires in 1–3 months', value: data.expireIn3Months, color: 'bg-yellow-300', startDate: oneMonthLater, endDate: threeMonthsLater },
    { label: 'Valid for 3+ months', value: data.wontExpireAnytimeSoon, color: 'bg-green-300', startDate: threeMonthsLater },
  ];

  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-baseline justify-between space-y-0">
        <CardTitle>Certificates</CardTitle>
        {data.newCertificatesDiscovered > 0 && (
          <span className="text-xs text-muted-foreground">
            {data.newCertificatesDiscovered} new in the last 30 days
          </span>
        )}
      </CardHeader>
      <CardContent>
        {/* Progress bar */}
        <div className="flex h-4 w-full overflow-hidden rounded-full mb-6 bg-muted">
          {items.map((item) => (
            <div
              key={item.label}
              className={item.color}
              style={{ width: `${total ? (item.value / total) * 100 : 0}%` }}
            />
          ))}
        </div>

        {/* Stats list */}
        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.label}
              className="flex items-center gap-3 w-full cursor-pointer hover:bg-muted/50 p-1.5 rounded transition-colors text-left"
              onClick={() => handleNavigate(item.startDate, item.endDate)}
            >
              <span className="text-base font-bold w-12">{item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}K` : item.value}</span>
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${item.color}`} />
              <span className="text-sm text-muted-foreground">{item.label}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default TlsStatistics;
