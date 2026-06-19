import { useTheme } from '@/components/ui/theme-provider';
import countriesData from '@/data/countries.json';
import type { IpLocationData } from '@/hooks/useIpLocationData';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { MapChart } from 'echarts/charts';
import { TooltipComponent, VisualMapComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useMemo, useRef } from 'react';
import IpLocationsTable from './ip-locations-table';

echarts.use([MapChart, TooltipComponent, VisualMapComponent, CanvasRenderer]);
echarts.registerMap(
  'world',
  countriesData as Parameters<typeof echarts.registerMap>[1],
);

const allCountryNames = (
  countriesData as {
    features: { properties: { NAME?: string; ISO_A2?: string } }[];
  }
).features
  .map((f) => ({
    name: f.properties.NAME,
    code: f.properties.ISO_A2,
  }))
  .filter((c) => c.name) as { name: string; code?: string }[];

interface IpLocationsCardProps {
  data: IpLocationData[];
  totalIps: number;
  selectedCountry?: string | null;
  onCountrySelect?: (countryCode: string | null) => void;
}

export default function IpLocationsCard({
  data,
  totalIps,
  selectedCountry,
  onCountrySelect,
}: IpLocationsCardProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const chartRef = useRef<ReactEChartsCore>(null);

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });

    if (selectedCountry) {
      const geo = allCountryNames.find((c) => c.code === selectedCountry);
      if (geo?.name) {
        chart.dispatchAction({
          type: 'select',
          seriesIndex: 0,
          name: geo.name,
        });
      }
    }
  }, [selectedCountry]);

  const maxIpCount = useMemo(() => {
    return Math.max(...data.map((d) => d.ipCount), 1);
  }, [data]);

  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e5e7eb',
        borderWidth: 1,
        textStyle: {
          color: isDark ? '#e2e8f0' : '#1f2937',
          fontFamily: 'system-ui, sans-serif',
        },
        formatter: (params: { name?: string; value?: number | null }) => {
          const name = params.name ?? 'Unknown';
          const value = params.value ?? 0;
          if (!params.value) return '';
          return `<div style="font-weight:600;margin-bottom:4px">${name}</div>
                  <div style="color:#6b7280;font-size:12px">IPs: ${value}</div>`;
        },
      },
      visualMap: {
        show: false,
        min: 0,
        max: maxIpCount,
        inRange: {
          color: isDark
            ? [
                'rgba(30, 58, 95, 0.15)',
                'rgba(96, 165, 250, 0.4)',
                'rgba(59, 130, 246, 0.5)',
                'rgba(37, 99, 235, 0.65)',
                'rgba(30, 64, 175, 0.95)',
              ]
            : [
                'rgba(219, 234, 254, 0.5)',
                'rgba(191, 219, 254, 0.6)',
                'rgba(147, 197, 253, 0.7)',
                'rgba(96, 165, 250, 0.8)',
                'rgba(37, 99, 235, 0.95)',
              ],
        },
        outOfRange: {
          color: 'transparent',
        },
      },
      series: [
        {
          type: 'map',
          map: 'world',
          roam: false,
          center: [10, 20],
          zoom: 1.1,
          nameProperty: 'NAME',
          selectedMode: 'single',
          select: {
            itemStyle: {
              areaColor: isDark
                ? 'rgba(96, 165, 250, 0.5)'
                : 'rgba(59, 130, 246, 0.4)',
              borderColor: isDark ? '#60a5fa' : '#3b82f6',
              borderWidth: 2,
            },
          },
          data: (() => {
            const dataMap = new Map(data.map((d) => [d.countryCode, d]));
            return allCountryNames.map((geo) => {
              const d = dataMap.get(geo.code ?? '');
              if (d) {
                return {
                  name: geo.name,
                  value: d.ipCount,
                  countryCode: d.countryCode,
                };
              }
              return {
                name: geo.name ?? '',
                value: null as unknown as number,
                countryCode: '',
              };
            });
          })(),
          emphasis: {
            itemStyle: {
              areaColor: isDark
                ? 'rgba(96, 165, 250, 0.4)'
                : 'rgba(59, 130, 246, 0.3)',
              borderColor: isDark ? '#93c5fd' : '#60a5fa',
              borderWidth: 2,
            },
            label: {
              show: false,
            },
          },
          itemStyle: {
            areaColor: 'transparent',
            borderColor: isDark ? '#1e3a5f' : '#cbd5e1',
            borderWidth: 1,
          },
          label: {
            show: false,
          },
        },
      ],
    }),
    [data, maxIpCount, isDark],
  );

  const onEvents = useMemo(
    () => ({
      click: (params: { data?: { countryCode?: string } }) => {
        if (params.data?.countryCode && onCountrySelect) {
          onCountrySelect(params.data.countryCode);
        }
      },
    }),
    [onCountrySelect],
  );

  return (
    <div
      className={`rounded-xl border h-full relative ${isDark ? 'bg-card' : 'bg-white'}`}
    >
      <div className="absolute top-4 left-4 z-10">
        <h3 className="font-semibold text-base">Locations</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Distribution of asset IPs by location
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 p-4 pt-0 gap-4">
        <div className="lg:col-span-3 relative overflow-hidden rounded-xl">
          <ReactEChartsCore
            ref={chartRef}
            echarts={echarts}
            option={option}
            onEvents={onEvents}
            style={{ height: '560px', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge
          />
          {/* <IpLocationsLegend min={minIpCount} max={maxIpCount} /> */}
        </div>
        <div
          className={`lg:col-span-1 rounded-xl p-2 self-center ${isDark ? 'bg-card' : 'bg-white'}`}
        >
          <IpLocationsTable
            data={data}
            totalIps={totalIps}
            selectedCountry={selectedCountry}
            onCountrySelect={onCountrySelect}
          />
        </div>
      </div>
    </div>
  );
}
