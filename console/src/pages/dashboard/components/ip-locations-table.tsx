import type { IpLocationData } from '@/hooks/useIpLocationData';
import { useMemo } from 'react';

interface IpLocationsTableProps {
  data: IpLocationData[];
  totalIps: number;
  selectedCountry?: string | null;
  onCountrySelect?: (countryCode: string | null) => void;
}

export default function IpLocationsTable({
  data,
  totalIps,
  selectedCountry,
  onCountrySelect,
}: IpLocationsTableProps) {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.ipCount - a.ipCount);
  }, [data]);

  const formatCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <div className="flex flex-col h-full border p-3 rounded-2xl">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <tbody>
            {sortedData.map((item) => (
              <tr
                key={item.countryCode}
                className={`cursor-pointer transition-colors ${
                  selectedCountry === item.countryCode
                    ? 'bg-primary/10'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => {
                  if (onCountrySelect) {
                    onCountrySelect(
                      selectedCountry === item.countryCode
                        ? null
                        : item.countryCode,
                    );
                  }
                }}
              >
                <td className="px-4 py-3">
                  <span className="font-medium">{item.country}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm text-muted-foreground font-medium">
                    {formatCount(item.ipCount)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm text-muted-foreground font-medium">
                  {formatCount(totalIps)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
