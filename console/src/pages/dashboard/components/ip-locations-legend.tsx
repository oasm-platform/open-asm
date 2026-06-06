interface IpLocationsLegendProps {
  min: number;
  max: number;
}

export default function IpLocationsLegend({ min, max }: IpLocationsLegendProps) {
  return (
    <div className="absolute bottom-2 left-2 z-10 bg-background/90 backdrop-blur-sm rounded-lg p-2 border">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{min}</span>
        <div
          className="w-24 h-2 rounded"
          style={{
            background: `linear-gradient(to right, #dbeafe, #f97316, #dc2626)`,
          }}
        />
        <span className="text-muted-foreground">{max} IPs</span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">IPs with issues</div>
    </div>
  );
}
