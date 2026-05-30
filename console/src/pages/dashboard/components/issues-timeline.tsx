'use client';

import clsx from 'clsx';
import { format } from 'date-fns';
import { Bug } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetIssuesTimeline } from '@/services/apis/gen/queries';

const chartConfig = {
  vuls: {
    label: 'Vulnerabilities',
  },
} satisfies ChartConfig;

export default function IssuesTimeline() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data, isLoading } = useStatisticControllerGetIssuesTimeline({
    query: {
      enabled: !!selectedWorkspaceId,
      queryKey: [selectedWorkspaceId],
    },
  });

  const chartData =
    data?.data?.map((item) => ({
      ...item,
      date: item.createdAt ? format(new Date(item.createdAt), 'MMM dd') : 'N/A',
    })) || [];

  const hasData = chartData.length > 0;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Issues Timeline</CardTitle>
        <CardDescription>Tracking vulnerability counts </CardDescription>
      </CardHeader>

      <CardContent className="relative">
        {!hasData && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 gap-3 bg-background/50 backdrop-blur-sm">
            <p className="text-sm text-muted-foreground">
              No data available yet
            </p>
            <Button variant="outline" size="sm" className="gap-2 shadow-sm">
              <Bug className="h-4 w-4" />
              Scan Vulnerabilities
            </Button>
          </div>
        )}

        <ChartContainer
          config={chartConfig}
          className={clsx(
            'w-full min-h-[250px]',
            !hasData && 'opacity-20 grayscale',
          )}
        >
          <AreaChart
            data={chartData}
            margin={{ left: 0, right: 0, top: 20, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.2}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={30}
              tick={{ fontSize: 12, fill: '#888' }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              width={40}
              tick={{ fontSize: 12, fill: '#888' }}
              tickFormatter={(value) =>
                new Intl.NumberFormat('en-US', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(value)
              }
            />
            <ChartTooltip
              cursor={{
                stroke: '#888',
                strokeWidth: 1,
                strokeDasharray: '4 4',
              }}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Area
              dataKey="vuls"
              type="basis"
              fill="hsl(var(--primary) / 0.1)"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              stackId="a"
              isAnimationActive={true}
              animationDuration={1500}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
