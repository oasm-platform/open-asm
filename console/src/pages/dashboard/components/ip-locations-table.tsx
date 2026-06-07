import { useMemo, useState } from 'react';
import type { IpLocationData } from '@/hooks/useIpLocationData';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';

interface IpLocationsTableProps {
  data: IpLocationData[];
  totalIps: number;
  totalCountries: number;
  selectedCountry?: string | null;
  onCountrySelect?: (countryCode: string | null) => void;
}

type SortField = 'country' | 'ipCount';
type SortOrder = 'asc' | 'desc';

export default function IpLocationsTable({
  data,
  totalIps,
  totalCountries,
  selectedCountry,
  onCountrySelect,
}: IpLocationsTableProps) {
  const [sortField, setSortField] = useState<SortField>('ipCount');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      if (sortField === 'country') {
        return multiplier * a.country.localeCompare(b.country);
      }
      return multiplier * (a.ipCount - b.ipCount);
    });
  }, [data, sortField, sortOrder]);

  const maxIpCount = useMemo(() => {
    return Math.max(...data.map((d) => d.ipCount), 1);
  }, [data]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortOrder === 'asc' ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  const formatCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4">
        <h3 className="font-semibold text-base">Locations</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          {totalCountries} countries, {totalIps.toLocaleString()} total IPs
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-xs">
              <th
                className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-foreground"
                onClick={() => handleSort('country')}
              >
                <div className="flex items-center gap-1">
                  Location
                  <SortIcon field="country" />
                </div>
              </th>
              <th
                className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-foreground"
                onClick={() => handleSort('ipCount')}
              >
                <div className="flex items-center gap-1">
                  IPs with open issues
                  <SortIcon field="ipCount" />
                </div>
              </th>
              <th className="text-right px-4 py-2.5 font-medium">Total IPs</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((item) => (
              <tr
                key={item.countryCode}
                className={`border-b cursor-pointer transition-colors ${
                  selectedCountry === item.countryCode
                    ? 'bg-primary/10'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => {
                  if (onCountrySelect) {
                    onCountrySelect(
                      selectedCountry === item.countryCode ? null : item.countryCode
                    );
                  }
                }}
              >
                <td className="px-4 py-3">
                  <span className="font-medium">{item.country}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                      {item.ipCount}
                    </span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{
                          width: `${(item.ipCount / maxIpCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
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
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                    {totalIps.toLocaleString()}
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full w-full" />
                  </div>
                </div>
              </td>
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
