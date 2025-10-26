import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetIssuesTimeline } from '@/services/apis/gen/queries';
import { format } from 'date-fns';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

const chartConfig = {
  vuls: {
    label: 'Vulnerabilities: ',
    color: 'hsl(var(--chart-1))',
  },
  createdAt: {
    label: 'Date',
  },
} satisfies ChartConfig;

export default function IssuesTimeline() {
  const { selectedWorkspace } = useWorkspaceSelector();
  const { data } = useStatisticControllerGetIssuesTimeline({
    query: {
      enabled: !!selectedWorkspace,
      queryKey: [selectedWorkspace],
    },

  });

  const rawData = data?.data?.map((item) => ({
    ...item,
    createdAt: format(new Date(item.createdAt), 'MMM dd'),
  })) || [];

  // Filter out consecutive duplicate vuls values to avoid horizontal lines in chart
  const chartData = rawData.filter((item, index, array) => {
    if (index === 0) return true;
    return item.vuls !== array[index - 1].vuls;
  });

  return (
    <Card className="w-full h-full p-2">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-lg">Issues timeline</CardTitle>
        <CardDescription className="text-xs">
          Number of vulnerabilities over time.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ChartContainer config={chartConfig} className="w-full">
          <AreaChart
            className="w-full h-64"
            accessibilityLayer
            data={chartData}
            margin={{
              left: 6,
              right: 6,
              top: 6,
              bottom: 6,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="createdAt"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => format(new Date(value), 'MMM dd')}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.toLocaleString()}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Area
              dataKey="vuls"
              type="monotone"
              fill="var(--color-vuls)"
              stroke="var(--color-vuls)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
