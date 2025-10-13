
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTimelineTrend } from "@/hooks/useTimelineTrend";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useVulnerabilitiesControllerGetVulnerabilitiesSeverity } from "@/services/apis/gen/queries";
import { Bug, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function VulnerabilitySeverityDonutChart() {
  const { selectedWorkspace } = useWorkspaceSelector();
  const { data: response } = useVulnerabilitiesControllerGetVulnerabilitiesSeverity({
    workspaceId: selectedWorkspace ?? "",
  });
  const data = response?.data;
  const { calculateTrend } = useTimelineTrend();

  if (!data || data.length === 0) return null;

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
    { severity: 'total', label: 'Total', colorClass: '', count: 0 },
    { severity: 'critical', label: 'Critical', colorClass: getSeverityColorClass('critical'), count: 0 },
    { severity: 'high', label: 'High', colorClass: getSeverityColorClass('high'), count: 0 },
    { severity: 'medium', label: 'Medium', colorClass: getSeverityColorClass('medium'), count: 0 },
    { severity: 'low', label: 'Low', colorClass: getSeverityColorClass('low'), count: 0 },
    { severity: 'info', label: 'Info', colorClass: getSeverityColorClass('info'), count: 0 },
  ];

  if (data && data.length > 0) {
    vulnerabilityStats.forEach(stat => {
      const item = data.find(d => d.severity === stat.severity);
      if (item) {
        stat.count = item.count;
      }
    });
    vulnerabilityStats[0].count = data.reduce((sum, item) => sum + item.count, 0); // Total count
  }

  const totalVulsTrend = calculateTrend('vuls');

  const renderTrend = (trend: ReturnType<typeof calculateTrend>) => {
    if (!trend) return null;
    return (
      <div className={`flex items-center text-sm ${trend.isIncreasing ? 'text-green-500' : trend.isDecreasing ? 'text-red-500' : 'text-gray-500'}`}>
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
      <Card className="w-full hover:bg-accent/70 cursor-pointer">
        <CardHeader className='flex justify-between items-center'>
          <div className="flex items-center gap-2">
            <CardTitle className="">Vulnerabilities Issues</CardTitle>
            {totalVulsTrend?.difference !== 0 && renderTrend(totalVulsTrend)}
          </div>
          <Bug />
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          {vulnerabilityStats.map((stat, index) => (
            <>
              <div key={stat.severity} className={`text-center ${index % 3 === 2 ? 'pl-4' : index % 3 === 0 ? 'pr-4 border-r' : 'px-4 border-r'}`}>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <p className={`text-2xl font-bold font-mono min-w-[3rem] ${stat.colorClass}`}>
                    {stat.count}
                  </p>
                </div>
              </div>
              {index === 2 && <div className="col-span-3 border-b pb-2 mb-2"></div>}
            </>
          ))}
        </CardContent>
      </Card></Link>
  );
}
