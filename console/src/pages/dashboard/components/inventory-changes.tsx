import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetInventoryChanges } from '@/services/apis/gen/queries';
import { CloudCheck, PackagePlus, Server } from 'lucide-react';

const InventoryChanges = () => {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading, error } = useStatisticControllerGetInventoryChanges({
    query: {
      queryKey: ['inventory-changes', selectedWorkspaceId],
    },
  });

  if (isLoading) {
    return (
      <Card className="h-[340px] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            Newly Discovered
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="h-[340px] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            Newly Discovered
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-full items-center justify-center text-sm text-red-600">
          Error loading data
        </CardContent>
      </Card>
    );
  }

  const counts = [
    {
      label: 'Assets · 7d',
      value: data.assetsAdded7Days,
      icon: <CloudCheck className="h-5 w-5 text-primary" />,
    },
    {
      label: 'Assets · 30d',
      value: data.assetsAdded30Days,
      icon: <CloudCheck className="h-5 w-5 text-primary" />,
    },
    {
      label: 'Services · 7d',
      value: data.servicesAdded7Days,
      icon: <Server className="h-5 w-5 text-primary" />,
    },
    {
      label: 'Services · 30d',
      value: data.servicesAdded30Days,
      icon: <Server className="h-5 w-5 text-primary" />,
    },
  ];

  return (
    <Card className="flex h-[340px] flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5 text-primary" />
          Newly Discovered
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col justify-center">
        <div className="grid grid-cols-2 gap-3">
          {counts.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                {item.icon}
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold font-mono leading-none">
                  {item.value >= 1000
                    ? `${(item.value / 1000).toFixed(1)}K`
                    : item.value}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {item.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default InventoryChanges;
