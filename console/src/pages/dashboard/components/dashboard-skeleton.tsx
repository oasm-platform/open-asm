import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bug,
  Clock3,
  CloudCheck,
  Cpu,
  Layers3,
  MapPinned,
  Radio,
  Server,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { ReactNode } from 'react';

const cardSurface =
  'overflow-hidden border-border/70 bg-card/90 shadow-sm [&_[data-slot=skeleton]]:motion-reduce:animate-none';

const statSparklines = [
  'M2 34 C24 30, 34 18, 54 24 S82 39, 102 19 S136 10, 158 16',
  'M2 32 C20 35, 31 20, 49 25 S74 12, 96 19 S129 28, 158 8',
  'M2 29 C18 17, 33 30, 50 20 S75 35, 96 22 S130 15, 158 12',
  'M2 35 C20 26, 33 36, 52 27 S80 17, 101 25 S130 10, 158 7',
];

function CardHeaderSkeleton({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0 space-y-2">
          <Skeleton
            className="h-4 max-w-full"
            style={{ width: `${title.length * 0.24}rem` }}
          />
          {description ? (
            <Skeleton
              className="h-3 max-w-[42vw]"
              style={{ width: `${description.length * 0.22}rem` }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatCardSkeleton({
  icon,
  sparkline,
  delay,
}: {
  icon: ReactNode;
  sparkline: string;
  delay: number;
}) {
  return (
    <Card className={`${cardSurface} relative h-40 gap-0 overflow-hidden py-0`}>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-primary/[0.06] to-transparent" />
      <div className="flex items-start justify-between px-5 pt-5">
        <div className="space-y-3">
          <Skeleton
            className="h-3.5 w-24"
            style={{ animationDelay: `${delay}ms` }}
          />
          <Skeleton
            className="h-8 w-20 rounded-lg"
            style={{ animationDelay: `${delay + 80}ms` }}
          />
        </div>
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/[0.08] text-primary">
          {icon}
        </span>
      </div>
      <div className="absolute inset-x-5 bottom-4 h-10">
        <svg
          aria-hidden="true"
          viewBox="0 0 160 40"
          preserveAspectRatio="none"
          className="h-full w-full text-primary/20"
        >
          <path
            d={`${sparkline} L158 40 L2 40 Z`}
            fill="currentColor"
            opacity="0.35"
          />
          <path
            d={sparkline}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.25"
          />
        </svg>
      </div>
    </Card>
  );
}

function TrendChartSkeleton({
  title,
  description,
  icon,
  issuesOnly = false,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  issuesOnly?: boolean;
}) {
  const primaryPath = issuesOnly
    ? 'M0 178 C45 168, 72 134, 116 145 S192 104, 238 117 S312 64, 360 82 S444 45, 500 58 S565 31, 620 40'
    : 'M0 154 C44 146, 78 105, 122 121 S196 70, 242 91 S316 54, 360 66 S440 28, 500 43 S566 20, 620 26';
  const secondaryPath =
    'M0 185 C54 177, 88 145, 134 158 S210 116, 258 133 S332 102, 380 111 S460 76, 518 89 S578 67, 620 72';

  return (
    <Card
      aria-busy="true"
      aria-label={`Loading ${title}`}
      className={`${cardSurface} h-full py-0`}
      role="status"
    >
      <CardHeaderSkeleton icon={icon} title={title} description={description} />
      <div className="p-5">
        <div className="relative h-[260px] overflow-hidden rounded-lg">
          <div
            className="absolute inset-0 opacity-45"
            style={{
              backgroundImage:
                'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
              backgroundSize: '52px 44px',
            }}
          />
          <div className="absolute inset-y-0 left-0 flex w-8 flex-col justify-between py-1">
            <Skeleton className="h-2.5 w-6" />
            <Skeleton className="h-2.5 w-7" />
            <Skeleton className="h-2.5 w-6" />
            <Skeleton className="h-2.5 w-7" />
          </div>
          <svg
            aria-hidden="true"
            viewBox="0 0 620 220"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full px-2"
          >
            {!issuesOnly ? (
              <path
                d={secondaryPath}
                fill="none"
                stroke="var(--chart-4)"
                strokeLinecap="round"
                strokeWidth="2"
                opacity="0.18"
              />
            ) : null}
            <path
              d={primaryPath}
              fill="none"
              stroke="var(--chart-1)"
              strokeLinecap="round"
              strokeWidth="2.5"
              opacity="0.24"
            />
          </svg>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-4">
          <Skeleton className="h-3 w-16" />
          {[70, 82, 64, 76, 68].map((width, index) => (
            <div className="flex items-center gap-2" key={width + index}>
              <Skeleton
                className="size-2.5 rounded-full"
                style={{ animationDelay: `${index * 70}ms` }}
              />
              <Skeleton className="h-3" style={{ width: `${width}px` }} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ListCardSkeleton({
  icon,
  title,
  description,
  rows = 6,
  showIcons = true,
  fullHeight = false,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  rows?: number;
  showIcons?: boolean;
  fullHeight?: boolean;
}) {
  const widths = ['w-28', 'w-36', 'w-24', 'w-32', 'w-20', 'w-30'];

  return (
    <Card
      aria-busy="true"
      aria-label={`Loading ${title}`}
      className={`${cardSurface} gap-0 py-0 ${
        fullHeight ? 'h-full min-h-[340px]' : 'h-[340px]'
      }`}
      role="status"
    >
      <CardHeaderSkeleton icon={icon} title={title} description={description} />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-4">
        {Array.from({ length: rows }, (_, index) => (
          <div
            className="flex min-h-12 flex-1 items-center gap-3 rounded-xl px-2 transition-colors hover:bg-muted/30"
            key={index}
          >
            {showIcons ? (
              <Skeleton
                className="size-8 shrink-0 rounded-lg"
                style={{ animationDelay: `${index * 60}ms` }}
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton
                className={`h-3.5 ${widths[index % widths.length]}`}
                style={{ animationDelay: `${index * 60}ms` }}
              />
              <div className="flex items-center gap-2">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-2.5 w-10" />
              </div>
            </div>
            <Skeleton
              className="h-4 w-8 shrink-0"
              style={{ animationDelay: `${index * 60 + 30}ms` }}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function VulnerabilityStatisticSkeleton() {
  const items = [
    'bg-chart-5/30',
    'bg-chart-3/30',
    'bg-chart-4/30',
    'bg-chart-1/30',
    'bg-muted-foreground/25',
    'bg-muted-foreground/15',
  ];

  return (
    <Card
      aria-busy="true"
      aria-label="Loading vulnerability statistics"
      className={`${cardSurface} h-full min-h-[350px] gap-0 py-0`}
      role="status"
    >
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bug className="size-4 text-muted-foreground" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
        <div className="relative mx-auto my-5 size-[170px]">
          <div className="absolute inset-0 motion-safe:animate-pulse rounded-full border-[10px] border-muted" />
          <div className="absolute inset-0 motion-safe:animate-pulse rounded-full border-[10px] border-transparent border-l-chart-5/30 border-t-chart-3/25" />
          <div className="absolute inset-[16px] rounded-full bg-card" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-5 w-10" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {items.map((className, index) => (
            <div
              className="space-y-2 rounded-xl bg-muted/35 px-2 py-3 text-center"
              key={className}
            >
              <Skeleton
                className={`mx-auto h-2.5 w-12 ${className}`}
                style={{ animationDelay: `${index * 70}ms` }}
              />
              <Skeleton
                className="mx-auto h-5 w-9"
                style={{ animationDelay: `${index * 70 + 30}ms` }}
              />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function TlsStatisticsSkeleton() {
  return (
    <Card
      aria-busy="true"
      aria-label="Loading TLS statistics"
      className={`${cardSurface} h-full gap-0 py-0`}
      role="status"
    >
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Clock3 className="size-3.5" />
            </span>
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="size-7 rounded-lg" />
        </div>
        <div className="mt-5 flex h-2.5 gap-1 overflow-hidden rounded-full">
          <Skeleton className="h-full flex-[2] rounded-full bg-destructive/25" />
          <Skeleton className="h-full flex-1 rounded-full bg-warning/35" />
          <Skeleton className="h-full flex-[1.4] rounded-full bg-chart-1/25" />
          <Skeleton className="h-full flex-3 rounded-full bg-success/25" />
        </div>
        <div className="mt-4 space-y-2.5">
          {[24, 18, 30, 21, 27].map((width, index) => (
            <div className="flex items-center gap-3" key={index}>
              <Skeleton className="h-3.5 w-7" />
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton
                className="h-3"
                style={{
                  width: `${width * 4}px`,
                  animationDelay: `${index * 60}ms`,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function IpLocationsSkeleton() {
  return (
    <Card
      aria-busy="true"
      aria-label="Loading IP locations"
      className={`${cardSurface} h-full min-h-[480px] gap-0 py-0`}
      role="status"
    >
      <CardHeaderSkeleton
        icon={<MapPinned className="size-4" />}
        title="Locations"
        description="Distribution of asset IPs by location"
      />
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,3fr)_minmax(13rem,1fr)]">
        <div className="relative min-h-[350px] overflow-hidden rounded-xl border bg-muted/20">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(circle, var(--border) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          />
          <div className="absolute left-[8%] top-[24%] h-20 w-40 -rotate-6 rounded-[45%] bg-muted/90 blur-[1px] sm:w-48" />
          <div className="absolute right-[13%] top-[20%] h-24 w-28 rotate-12 rounded-[42%] bg-muted/80 blur-[1px]" />
          <div className="absolute left-[24%] top-[54%] h-24 w-32 rotate-6 rounded-[48%] bg-muted/80 blur-[1px]" />
          <div className="absolute bottom-[12%] right-[12%] h-14 w-20 -rotate-12 rounded-[50%] bg-muted/70 blur-[1px]" />
          {[
            'left-[20%] top-[35%]',
            'left-[48%] top-[28%]',
            'left-[60%] top-[48%]',
            'left-[35%] top-[68%]',
            'right-[20%] top-[64%]',
          ].map((position) => (
            <span
              className={`absolute size-3 rounded-full border-2 border-card bg-primary/20 shadow-sm ${position}`}
              key={position}
            />
          ))}
        </div>
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-12" />
          </div>
          {Array.from({ length: 6 }, (_, index) => (
            <div
              className="flex items-center gap-3 rounded-lg px-1 py-2"
              key={index}
            >
              <Skeleton className="size-7 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-16" />
              </div>
              <Skeleton className="h-3.5 w-7" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function DashboardStatsSkeleton() {
  const stats = [
    {
      title: 'Targets',
      icon: <Target className="size-5" />,
      sparkline: statSparklines[0],
    },
    {
      title: 'Assets',
      icon: <CloudCheck className="size-5" />,
      sparkline: statSparklines[1],
    },
    {
      title: 'Services',
      icon: <Server className="size-5" />,
      sparkline: statSparklines[2],
    },
    {
      title: 'Technologies',
      icon: <Cpu className="size-5" />,
      sparkline: statSparklines[3],
    },
  ];

  return (
    <section
      aria-busy="true"
      aria-label="Loading dashboard statistics"
      className="grid h-full grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4 [&_[data-slot=skeleton]]:motion-reduce:animate-none"
      role="status"
    >
      {stats.map((stat, index) => (
        <StatCardSkeleton
          delay={index * 90}
          icon={stat.icon}
          key={stat.title}
          sparkline={stat.sparkline}
        />
      ))}
    </section>
  );
}

export function AssetTrendsSkeleton() {
  return (
    <TrendChartSkeleton
      icon={<TrendingUp className="size-4" />}
      title="Asset trend"
    />
  );
}

export function IssuesTimelineSkeleton() {
  return (
    <TrendChartSkeleton
      icon={<Bug className="size-4" />}
      issuesOnly
      title="Issues Timeline"
    />
  );
}

export function RecentAssetsSkeleton() {
  return (
    <ListCardSkeleton
      fullHeight
      icon={<Clock3 className="size-4" />}
      showIcons={false}
      title="Recent Hosts"
    />
  );
}

export function TopPortsSkeleton() {
  return (
    <ListCardSkeleton icon={<Radio className="size-4" />} title="Top Ports" />
  );
}

export function TopTechnologiesSkeleton() {
  return (
    <ListCardSkeleton
      icon={<Layers3 className="size-4" />}
      title="Technologies"
    />
  );
}

export function TopAssetsVulnerabilitiesSkeleton() {
  return (
    <ListCardSkeleton
      fullHeight
      icon={<Bug className="size-4" />}
      rows={5}
      title="Top assets with most vulnerabilities"
    />
  );
}
