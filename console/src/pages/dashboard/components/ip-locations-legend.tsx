import { useTheme } from '@/components/ui/theme-provider';

interface IpLocationsLegendProps {
  min: number;
  max: number;
}

export default function IpLocationsLegend({ min, max }: IpLocationsLegendProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-background/95 backdrop-blur-sm rounded-lg px-3 py-2 border shadow-sm">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground font-medium">{min}</span>
        <div
          className="w-32 h-2 rounded"
          style={{
            background: isDark
              ? 'linear-gradient(to right, rgba(96, 165, 250, 0.4), rgba(37, 99, 235, 0.65), rgba(30, 64, 175, 0.95))'
              : 'linear-gradient(to right, rgba(191, 219, 254, 0.6), rgba(96, 165, 250, 0.8), rgba(37, 99, 235, 0.95))',
          }}
        />
        <span className="text-muted-foreground font-medium">{max}</span>
      </div>
    </div>
  );
}
