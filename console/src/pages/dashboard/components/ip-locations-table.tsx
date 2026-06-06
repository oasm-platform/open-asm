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

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Locations</h3>
        <p className="text-sm text-muted-foreground">
          {totalCountries} countries, {totalIps.toLocaleString()} total IPs
        </p>
      </div>
      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50">
            <tr className="border-b">
              <th
                className="text-left p-3 font-medium cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('country')}
              >
                <div className="flex items-center gap-1">
                  Location
                  <SortIcon field="country" />
                </div>
              </th>
              <th
                className="text-left p-3 font-medium cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('ipCount')}
              >
                <div className="flex items-center gap-1">
                  IPs
                  <SortIcon field="ipCount" />
                </div>
              </th>
              <th className="text-right p-3 font-medium">Distribution</th>
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
                <td className="p-3">
                  <div className="font-medium">{item.country}</div>
                  <div className="text-xs text-muted-foreground">{item.countryCode}</div>
                </td>
                <td className="p-3">
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                    {item.ipCount}
                  </span>
                </td>
                <td className="p-3">
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${(item.ipCount / maxIpCount) * 100}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-muted/50">
            <tr className="border-t font-medium">
              <td className="p-3">Total</td>
              <td className="p-3">
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                  {totalIps.toLocaleString()}
                </span>
              </td>
              <td className="p-3">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full w-full" />
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
