'use client';

import clsx from 'clsx';
import { format } from 'date-fns';
import { Bug, TrendingDown, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
    color: 'var(--chart-4)',
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
      date: format(new Date(item.createdAt), 'MMM dd'),
    })) || [];

  const hasData = chartData.length > 0;

  const latestData = chartData[chartData.length - 1];
  const previousData = chartData[chartData.length - 2];
  const trendDifference =
    latestData && previousData ? latestData.vuls - previousData.vuls : 0;

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
            margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fillVuls" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-vuls)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-vuls)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
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
              type="monotone"
              fill="url(#fillVuls)"
              stroke="var(--color-vuls)"
              strokeWidth={2}
              stackId="a"
              isAnimationActive={true}
              animationDuration={1500}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      {hasData && (
        <CardFooter className="flex-col items-start gap-2 text-sm pt-6 pb-5">
          <div className="flex gap-2 font-medium leading-none">
            {trendDifference > 0 ? (
              <>
                Trending up by {trendDifference}
                <TrendingUp className="h-4 w-4 text-red-500" />
              </>
            ) : trendDifference < 0 ? (
              <>
                Trending down by {Math.abs(trendDifference)}
                <TrendingDown className="h-4 w-4 text-emerald-500" />
              </>
            ) : (
              <>
                No change
                <TrendingUp className="h-4 w-4 text-gray-500" />
              </>
            )}
          </div>
          <div className="leading-none text-muted-foreground text-xs">
            Showing total vulnerabilities for the last 30 days
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
