import { useTheme } from '@/components/ui/theme-provider';

interface IpLocationsLegendProps {
  min: number;
  max: number;
}

export default function IpLocationsLegend({ min, max }: IpLocationsLegendProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="absolute bottom-2 left-2 z-10 bg-background/90 backdrop-blur-sm rounded-lg p-2 border">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{min}</span>
        <div
          className="w-24 h-2 rounded"
          style={{
            background: isDark
              ? 'linear-gradient(to right, rgba(96, 165, 250, 0.4), rgba(37, 99, 235, 0.65), rgba(30, 64, 175, 0.95))'
              : 'linear-gradient(to right, rgba(191, 219, 254, 0.6), rgba(96, 165, 250, 0.8), rgba(37, 99, 235, 0.95))',
          }}
        />
        <span className="text-muted-foreground">{max} IPs</span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">IPs with issues</div>
    </div>
  );
}
