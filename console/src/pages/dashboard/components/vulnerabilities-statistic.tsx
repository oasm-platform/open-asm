import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberAnimate } from '@/components/ui/number-animate';
import { useStatistics } from '@/hooks/useStatistics';
import { useTimelineTrend } from '@/hooks/useTimelineTrend';
import { Bug, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import Score from './score';

export default function VulnerabilityStatistic() {
  const { statistics } = useStatistics();
  const { calculateTrend } = useTimelineTrend();

  if (!statistics) return null;

  const getSeverityColorClass = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-500';
      case 'high':
        return 'text-orange-500';
      case 'medium':
        return 'text-yellow-500';
      case 'low':
        return 'text-blue-500';
      case 'info':
        return 'text-gray-500';
      default:
        return '';
    }
  };

  const vulnerabilityStats = [
    {
      severity: 'total',
      label: 'Total',
      colorClass: '',
      count: statistics?.vuls || 0,
    },
    {
      severity: 'critical',
      label: 'Critical',
      colorClass: getSeverityColorClass('critical'),
      count: statistics?.criticalVuls || 0,
    },
    {
      severity: 'high',
      label: 'High',
      colorClass: getSeverityColorClass('high'),
      count: statistics?.highVuls || 0,
    },
    {
      severity: 'medium',
      label: 'Medium',
      colorClass: getSeverityColorClass('medium'),
      count: statistics?.mediumVuls || 0,
    },
    {
      severity: 'low',
      label: 'Low',
      colorClass: getSeverityColorClass('low'),
      count: statistics?.lowVuls || 0,
    },
    {
      severity: 'info',
      label: 'Info',
      colorClass: getSeverityColorClass('info'),
      count: statistics?.infoVuls || 0,
    },
  ];

  const totalVulsTrend = calculateTrend('vuls');

  const renderTrend = (trend: ReturnType<typeof calculateTrend>) => {
    if (!trend) return null;
    return (
      <div
        className={`flex items-center text-sm ${trend.isIncreasing ? 'text-green-500' : trend.isDecreasing ? 'text-red-500' : 'text-gray-500'}`}
      >
        {trend.isIncreasing ? (
          <TrendingUp className="h-4 w-4 mr-1" />
        ) : trend.isDecreasing ? (
          <TrendingDown className="h-4 w-4 mr-1" />
        ) : null}
        <span className="font-medium font-mono">
          {Math.abs(trend.difference)}
        </span>
      </div>
    );
  };

  return (
    <Link to="/vulnerabilities">
      <Card className="w-full hover:bg-accent/70 pt-3 cursor-pointer">
        <Score />
        <CardHeader className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CardTitle>Vulnerabilities issues</CardTitle>
            {totalVulsTrend?.difference !== 0 && renderTrend(totalVulsTrend)}
          </div>
          <Bug />
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 -mt-2">
          {vulnerabilityStats.map((stat) => (
            <div key={stat.severity} className="text-center px-4 py-2">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p
                className={`text-2xl font-bold font-mono ${stat.colorClass}`}
              >
                <NumberAnimate value={stat.count} />
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </Link>
  );
}
