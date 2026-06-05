'use client';

import { useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

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
import { useStatisticControllerGetTimelineStatistics } from '@/services/apis/gen/queries';
import { format } from 'date-fns';

const chartConfig = {
  assets: { label: 'Assets', color: 'var(--chart-2)' },
  techs: { label: 'Technologies', color: 'var(--chart-1)' },
  ports: { label: 'Ports', color: 'var(--chart-4)' },
  services: { label: 'Services', color: 'var(--chart-3)' },
  targets: { label: 'Targets', color: 'var(--chart-5)' },
} satisfies ChartConfig;

const metricsOrder = [
  'assets',
  'techs',
  'ports',
  'services',
  'targets',
] as const;
type MetricKey = (typeof metricsOrder)[number];

export function AssetTrends() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data } = useStatisticControllerGetTimelineStatistics({
    query: {
      enabled: !!selectedWorkspaceId,
      queryKey: [selectedWorkspaceId],
      refetchInterval: 60 * 60 * 1000,
    },
  });

  const chartData =
    data?.data?.map((item) => ({
      ...item,
      createdAt: item.createdAt
        ? format(new Date(item.createdAt), 'MMM dd')
        : 'N/A',
    })) || [];

  const [visibleMetrics, setVisibleMetrics] = useState<
    Record<MetricKey, boolean>
  >({
    assets: true,
    techs: true,
    ports: true,
    services: true,
    targets: true,
  });

  const toggleMetric = (metric: MetricKey) => {
    setVisibleMetrics((prev) => ({
      ...prev,
      [metric]: !prev[metric],
    }));
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Asset trend</CardTitle>
        <CardDescription>Trend overtime</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="w-full h-[300px]">
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ left: 12, right: 12, top: 20 }}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.5}
            />

            <XAxis
              dataKey="createdAt"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              tickFormatter={(value) =>
                new Intl.NumberFormat('en-US', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(value)
              }
            />
            <ChartTooltip
              cursor={{ stroke: 'var(--muted-foreground)' }}
              content={<ChartTooltipContent />}
            />

            {metricsOrder.map((key) => {
              const { label, color } = chartConfig[key];
              if (!visibleMetrics[key]) return null;

              return (
                <Line
                  key={key}
                  dataKey={key}
                  type="monotone"
                  name={label}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={true}
                  // strokeOpacity={visibleMetrics[key] ? 1 : 0.1}
                />
              );
            })}
          </LineChart>
        </ChartContainer>

        <div className="flex items-center gap-6 mt-6 pt-4 border-t border-border text-sm">
          <span className="text-muted-foreground text-xs">Current</span>
          {metricsOrder.map((key) => {
            const { label, color } = chartConfig[key];
            const isVisible = visibleMetrics[key];

            return (
              <button
                key={key}
                onClick={() => toggleMetric(key)}
                className={`flex items-center gap-2 transition-opacity ${isVisible ? 'opacity-100' : 'opacity-30'}`}
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
