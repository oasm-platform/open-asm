import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberAnimate } from '@/components/ui/number-animate';
import { useStatistics } from '@/hooks/useStatistics';
import { TREND_WINDOW_DAYS, useTimelineTrend } from '@/hooks/useTimelineTrend';
import { VulnerabilityStatisticSkeleton } from './dashboard-skeleton';
import { Bug, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { SEVERITY_TEXT_CLASS } from '../severity';
import Score from './score';

export default function VulnerabilityStatistic() {
  const { statistics, isLoading } = useStatistics();
  const { calculateTrend } = useTimelineTrend();

  if (isLoading) return <VulnerabilityStatisticSkeleton />;

  if (!statistics) return null;

  const vulnerabilityStats = [
    {
      severity: 'total',
      label: 'Open',
      colorClass: '',
      count: statistics?.vuls || 0,
    },
    {
      severity: 'critical',
      label: 'Critical',
      colorClass: SEVERITY_TEXT_CLASS.critical,
      count: statistics?.criticalVuls || 0,
    },
    {
      severity: 'high',
      label: 'High',
      colorClass: SEVERITY_TEXT_CLASS.high,
      count: statistics?.highVuls || 0,
    },
    {
      severity: 'medium',
      label: 'Medium',
      colorClass: SEVERITY_TEXT_CLASS.medium,
      count: statistics?.mediumVuls || 0,
    },
    {
      severity: 'low',
      label: 'Low',
      colorClass: SEVERITY_TEXT_CLASS.low,
      count: statistics?.lowVuls || 0,
    },
    {
      severity: 'info',
      label: 'Info',
      hint: 'Informational findings are not counted as open',
      colorClass: SEVERITY_TEXT_CLASS.info,
      count: statistics?.infoVuls || 0,
    },
  ];

  const totalVulsTrend = calculateTrend('vuls');

  // More open vulnerabilities is worse, so growth reads as a warning.
  const renderTrend = (trend: ReturnType<typeof calculateTrend>) => {
    if (!trend) return null;
    return (
      <div
        className={`flex items-center text-sm ${trend.isIncreasing ? 'text-destructive' : trend.isDecreasing ? 'text-success' : 'text-muted-foreground'}`}
        title={`Change over the last ${TREND_WINDOW_DAYS} days`}
      >
        {trend.isIncreasing ? (
          <TrendingUp className="h-4 w-4 mr-1" />
        ) : trend.isDecreasing ? (
          <TrendingDown className="h-4 w-4 mr-1" />
        ) : null}
        <span className="font-medium font-mono">
          {Math.abs(trend.difference)}
        </span>
        <span className="ml-1 text-xs text-muted-foreground">
          {TREND_WINDOW_DAYS}d
        </span>
      </div>
    );
  };

  return (
    <Link to="/vulnerabilities" className="block h-full">
      <Card className="w-full h-full hover:bg-accent/70 pt-3 cursor-pointer">
        <Score />
        <CardHeader className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CardTitle>Open vulnerabilities</CardTitle>
            {totalVulsTrend?.difference !== 0 && renderTrend(totalVulsTrend)}
          </div>
          <Bug />
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 -mt-2">
          {vulnerabilityStats.map((stat) => (
            <div
              key={stat.severity}
              className="text-center px-4 py-2"
              title={stat.hint}
            >
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold font-mono ${stat.colorClass}`}>
                <NumberAnimate value={stat.count} />
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </Link>
  );
}
