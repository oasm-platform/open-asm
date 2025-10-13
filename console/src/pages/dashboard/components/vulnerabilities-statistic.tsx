
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useVulnerabilitiesControllerGetVulnerabilitiesSeverity } from "@/services/apis/gen/queries";
import { Bug } from 'lucide-react';

export default function VulnerabilitySeverityDonutChart() {
  const { selectedWorkspace } = useWorkspaceSelector();
  const { data: response } = useVulnerabilitiesControllerGetVulnerabilitiesSeverity({
    workspaceId: selectedWorkspace ?? "",
  });
  const data = response?.data;
  if (!data || data.length === 0) return null;

  const totalSeverityCount = data.reduce((sum, item) => sum + item.count, 0);

  const getSeverityCount = (severity: string) => {
    const item = data.find(item => item.severity === severity);
    return item ? item.count : 0;
  };

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

  return (
    <Card className="w-full">
      <CardHeader className='flex justify-between items-center'>
        <CardTitle className="">Vulnerabilities Issues</CardTitle>
        <Bug />
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-4">
        <div className="text-center border-r pr-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold font-mono min-w-[3rem]">{totalSeverityCount}</p>
        </div>
        <div className="text-center border-r px-4">
          <p className="text-sm text-muted-foreground">Critical</p>
          <p className={`text-2xl font-bold font-mono min-w-[3rem] ${getSeverityColorClass('critical')}`}>
            {getSeverityCount('critical')}
          </p>
        </div>
        <div className="text-center pl-4">
          <p className="text-sm text-muted-foreground">High</p>
          <p className={`text-2xl font-bold font-mono min-w-[3rem] ${getSeverityColorClass('high')}`}>
            {getSeverityCount('high')}
          </p>
        </div>
        <div className="col-span-3 border-b pb-2 mb-2"></div>
        <div className="text-center border-r pr-4">
          <p className="text-sm text-muted-foreground">Medium</p>
          <p className={`text-2xl font-bold font-mono min-w-[3rem] ${getSeverityColorClass('medium')}`}>
            {getSeverityCount('medium')}
          </p>
        </div>
        <div className="text-center border-r px-4">
          <p className="text-sm text-muted-foreground">Low</p>
          <p className={`text-2xl font-bold font-mono min-w-[3rem] ${getSeverityColorClass('low')}`}>
            {getSeverityCount('low')}
          </p>
        </div>
        <div className="text-center pl-4">
          <p className="text-sm text-muted-foreground">Info</p>
          <p className={`text-2xl font-bold font-mono min-w-[3rem] ${getSeverityColorClass('info')}`}>
            {getSeverityCount('info')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
