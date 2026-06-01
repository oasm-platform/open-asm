import { Button } from '@/components/ui/button';
import { DatePickerWithRange } from '@/components/ui/date-picker-range';
import { Input } from '@/components/ui/input';
import useDebounce from '@/hooks/use-debounce';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAsset } from '../context/asset-context';
import {
  HostsFacetedFilter,
  IpFacetedFilter,
  PortFacetedFilter,
  StatusCodesFacetedFilter,
  TechsFacetedFilter,
  TlsFacetedFilter,
} from './faceted-filter';

export default function FilterFormInfinite() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const {
    tableParams: { filter },
    tableHandlers: { setFilter },
    dateRange,
    setDateRange,
  } = useAsset();

  const [searchValue, setSearchValue] = useState(filter ?? '');
  const debouncedValue = useDebounce(searchValue, 500);
  useEffect(() => {
    setFilter(debouncedValue);
  }, [debouncedValue, setFilter]);

  const facets = [
    'ipAddresses',
    'statusCodes',
    'techs',
    'ports',
    'hosts',
    'tlsHosts',
  ];
  const isFiltered =
    facets.some((e: string) => e in search) ||
    'startDate' in search ||
    'endDate' in search;

  return (
    <div className="flex flex-col gap-2 w-full md:flex-row md:items-center md:justify-between md:gap-0">
      <div className="flex flex-1 flex-col-reverse items-start gap-y-2 md:flex-row md:items-center md:space-x-2">
        <Input
          placeholder="Filter value"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          className="h-9 w-full md:w-[200px] lg:w-[300px]"
        />
        <div className="flex flex-wrap gap-x-2 gap-y-2 md:flex-nowrap md:gap-x-2">
          <IpFacetedFilter />
          <PortFacetedFilter />
          <TechsFacetedFilter />
          <StatusCodesFacetedFilter />
          <HostsFacetedFilter />
          <TlsFacetedFilter />
          <DatePickerWithRange
            label="Date"
            value={dateRange}
            onChange={setDateRange}
            className="w-60"
          />
        </div>
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => {
              navigate({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                search: (prev: any) => {
                  const next = { ...prev };
                  for (const facet of facets) {
                    delete next[facet];
                  }
                  delete next.startDate;
                  delete next.endDate;
                  next.page = '1';
                  return next;
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any);
              setDateRange(undefined);
            }}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ms-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
