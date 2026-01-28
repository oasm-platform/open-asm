import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  type ChartData,
  type ChartOptions,
  type ScriptableContext,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { useMemo } from 'react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  ChartDataLabels,
);

type SupportedChartType = 'bar' | 'pie' | 'doughnut' | 'line' | 'radar';

interface ChartRendererProps<
  T extends SupportedChartType = SupportedChartType,
> {
  type: T;
  data: ChartData<T>;
  options?: ChartOptions<T>;
  height?: number;
  showLabels?: boolean;
}

export const ChartRenderer = <T extends SupportedChartType>({
  type,
  data,
  options,
  height = 300,
  showLabels = true,
}: ChartRendererProps<T>) => {
  // Generate a unique key based on chart type and data to force re-render when needed
  const chartKey = useMemo(() => {
    return `${type}-${JSON.stringify(data.labels)}-${Date.now()}`;
  }, [type, data.labels]);

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            family: "'Inter', sans-serif",
            size: 11,
            weight: 'bold' as const,
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: 12,
        titleFont: {
          size: 14,
          weight: 'bold' as const,
        },
        bodyFont: {
          size: 13,
        },
        cornerRadius: 8,
      },
      datalabels: {
        display: showLabels,
        color: '#fff',
        font: {
          weight: 'bold' as const,
          size: 11,
        },
        formatter: (value: unknown, ctx: ScriptableContext<T>) => {
          if (typeof value !== 'number' || value === 0) return null;
          const dataset = ctx.chart.data.datasets[0];
          const dataPoints = dataset.data as number[];
          const sum = dataPoints.reduce(
            (a: number, b: number) => a + (b || 0),
            0,
          );
          if (sum === 0) return null;
          const percentage = ((value * 100) / sum).toFixed(0) + '%';
          return percentage;
        },
        clip: true,
      },
    },
    ...options,
  };

  const containerStyle = { height: `${height}px`, width: '100%' };

  return (
    <div style={containerStyle}>
      <Chart
        key={chartKey}
        type={type}
        data={data as ChartData<T>}
        options={defaultOptions as ChartOptions<T>}
        redraw
      />
    </div>
  );
};
