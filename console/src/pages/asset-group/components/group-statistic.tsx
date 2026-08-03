import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberAnimate } from '@/components/ui/number-animate';
import { useAssetGroupControllerGetStatistic } from '@/services/apis/gen/queries';
import { CloudCheck, Server, ShieldAlert, Waypoints } from 'lucide-react';

const SEVERITIES = [
  { key: 'criticalVuls', label: 'Critical', color: '#dc2626' },
  { key: 'highVuls', label: 'High', color: '#f97316' },
  { key: 'mediumVuls', label: 'Medium', color: '#eab308' },
  { key: 'lowVuls', label: 'Low', color: '#3b82f6' },
  { key: 'infoVuls', label: 'Info', color: '#9ca3af' },
] as const;

interface GroupStatisticProps {
  assetGroupId: string;
}

export function GroupStatistic({ assetGroupId }: GroupStatisticProps) {
  const { data: stats, isLoading } =
    useAssetGroupControllerGetStatistic(assetGroupId);

  const severityTotal = stats
    ? stats.criticalVuls +
      stats.highVuls +
      stats.mediumVuls +
      stats.lowVuls +
      stats.infoVuls
    : 0;

  const cards = [
    {
      title: 'Assets',
      icon: <CloudCheck className="h-5 w-5 text-primary" />,
      value: stats?.totalAssets ?? 0,
    },
    {
      title: 'Vulnerabilities',
      icon: <ShieldAlert className="h-5 w-5 text-destructive" />,
      value: stats?.vulns ?? 0,
    },
    {
      title: 'Ports',
      icon: <Waypoints className="h-5 w-5 text-primary" />,
      value: stats?.ports ?? 0,
    },
    {
      title: 'Services',
      icon: <Server className="h-5 w-5 text-primary" />,
      value: stats?.services ?? 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>{card.title}</CardTitle>
            {card.icon}
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold font-mono">
              {isLoading ? '—' : <NumberAnimate value={card.value} />}
            </p>
            {card.title === 'Vulnerabilities' && stats && !isLoading && (
              <div className="mt-3">
                <div
                  className="flex h-2 w-full overflow-hidden rounded-full"
                  data-testid="severity-bar"
                >
                  {SEVERITIES.map((severity) => {
                    const count = stats[severity.key];
                    if (count === 0) return null;
                    return (
                      <div
                        key={severity.key}
                        data-testid={`severity-segment-${severity.key}`}
                        className="h-full"
                        style={{
                          width: `${(count / Math.max(severityTotal, 1)) * 100}%`,
                          backgroundColor: severity.color,
                        }}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {SEVERITIES.map((severity) => {
                    const count = stats[severity.key];
                    if (count === 0) return null;
                    return (
                      <span
                        key={severity.key}
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: severity.color }}
                        />
                        {severity.label} {count}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
