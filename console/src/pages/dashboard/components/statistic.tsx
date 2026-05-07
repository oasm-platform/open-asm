import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberAnimate } from '@/components/ui/number-animate';
import { useStatistics } from '@/hooks/useStatistics';
import {
  useTimelineTrend,
  type TimelineStatistic,
} from '@/hooks/useTimelineTrend';
import {
  CloudCheck,
  Cpu,
  Server,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export default function Statistic() {
  const navigate = useNavigate();

  const { statistics, isLoading } = useStatistics();
  const { calculateTrend, timelineData } = useTimelineTrend();

  const chartData = useMemo(() => {
    if (!timelineData) return [];
    return [...timelineData].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [timelineData]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-muted rounded w-16"></div>
              <div className="h-5 w-5 bg-muted rounded-full"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-8"></div>
              <div className="mt-4 h-12 bg-muted rounded w-full opacity-50"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statsCards: Array<{
    title: string;
    icon: React.ReactNode;
    value: number;
    path: string;
    trend: ReturnType<typeof calculateTrend>;
    color: string;
    field: keyof TimelineStatistic;
  }> = [
    {
      title: 'Targets',
      field: 'targets',
      icon: <Target className="h-5 w-5 text-primary" />,
      value: statistics?.targets || 0,
      path: '/targets',
      trend: calculateTrend('targets'),
      color: 'var(--chart-5)',
    },
    {
      title: 'Assets',
      field: 'assets',
      icon: <CloudCheck className="h-5 w-5 text-primary" />,
      value: statistics?.assets || 0,
      path: '/assets',
      trend: calculateTrend('assets'),
      color: 'var(--chart-4)',
    },
    {
      title: 'Services',
      field: 'services',
      icon: <Server className="h-5 w-5 text-primary" />,
      value: statistics?.services || 0,
      path: '/assets',
      trend: calculateTrend('services'),
      color: 'var(--chart-1)',
    },
    {
      title: 'Technologies',
      field: 'techs',
      icon: <Cpu className="h-5 w-5 text-primary" />,
      value: statistics?.techs || 0,
      path: '/assets?tab=technology',
      trend: calculateTrend('techs'),
      color: 'var(--chart-2)',
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
      {statsCards.map((card, index) => (
        <Card
          key={index}
          className="cursor-pointer transition-colors hover:bg-accent/70 overflow-hidden relative group flex flex-col"
          onClick={() => card.path && navigate(card.path)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            {card.icon}
          </CardHeader>

          <CardContent className="pb-0 px-0 flex-1 flex flex-col justify-between">
            <div className="px-6 flex items-baseline justify-between">
              <p className="text-4xl font-bold font-mono">
                <NumberAnimate value={card.value} />
              </p>
              {card.trend && card.trend.difference !== 0 && (
                <div
                  className={`flex items-center text-sm ${
                    card.trend.isIncreasing
                      ? 'text-green-500'
                      : card.trend.isDecreasing
                        ? 'text-red-500'
                        : 'text-gray-500'
                  }`}
                >
                  {card.trend.isIncreasing ? (
                    <TrendingUp className="h-4 w-4 mr-1" />
                  ) : card.trend.isDecreasing ? (
                    <TrendingDown className="h-4 w-4 mr-1" />
                  ) : null}
                  <span className="font-medium font-mono">
                    {Math.abs(card.trend.difference)}
                  </span>
                </div>
              )}
            </div>

            <div className="h-[60px] w-full mt-4 opacity-60 group-hover:opacity-100 transition-opacity duration-300">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient
                      id={`fill-${card.field}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={card.color}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={card.color}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey={card.field}
                    stroke={card.color}
                    fill={`url(#fill-${card.field})`}
                    strokeWidth={2}
                    isAnimationActive={true}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
