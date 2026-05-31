import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetTlsStatistics } from '@/services/apis/gen/queries';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

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
    const params = new URLSearchParams({
      tab: 'tls',
      page: '1',
      sortBy: 'not_after',
      sortOrder: 'ASC',
    });
    if (startDate) params.set('startDate', format(startDate, 'yyyy-MM-dd'));
    if (endDate) params.set('endDate', format(endDate, 'yyyy-MM-dd'));
    navigate(`/assets?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>TLS Statistics</CardTitle>
        </CardHeader>
        <CardContent>Loading...</CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>TLS Statistics</CardTitle>
        </CardHeader>
        <CardContent className="text-red-600">Error loading data</CardContent>
      </Card>
    );
  }

  const today = new Date();
  const oneMonthLater = new Date(today);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  const threeMonthsLater = new Date(today);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  const items = [
    { label: 'already expired', value: data.alreadyExpired, color: 'bg-red-400', endDate: today },
    { label: 'expire in a month', value: data.expireInAMonth, color: 'bg-orange-300', startDate: today, endDate: oneMonthLater },
    { label: 'expire in 3 months', value: data.expireIn3Months, color: 'bg-yellow-300', startDate: oneMonthLater, endDate: threeMonthsLater },
    { label: 'won\'t expire anytime soon', value: data.wontExpireAnytimeSoon, color: 'bg-green-300', startDate: threeMonthsLater },
    { label: 'new certificates discovered', value: data.newCertificatesDiscovered, color: 'bg-blue-400' },
  ];

  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>TLS Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Progress bar */}
        <div className="flex h-4 w-full overflow-hidden rounded-full mb-6">
          {items.map((item) => (
            <div
              key={item.label}
              className={item.color}
              style={{ width: `${(item.value / total) * 100}%` }}
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
              <span className="text-sm text-muted-foreground capitalize">{item.label}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default TlsStatistics;
