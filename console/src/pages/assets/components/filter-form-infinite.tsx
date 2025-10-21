import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import useDebounce from '@/hooks/use-debounce';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsset } from '../context/asset-context';
import {
  IpFacetedFilter,
  PortFacetedFilter,
  StatusCodesFacetedFilter,
  TechsFacetedFilter,
} from './faceted-filter';

export default function FilterFormInfinite() {
  const [params, setParams] = useSearchParams();
  const {
    tableParams: { filter },
    tableHandlers: { setFilter },
  } = useAsset();

  const [searchValue, setSearchValue] = useState(filter ?? '');
  const debouncedValue = useDebounce(searchValue, 500);

  useEffect(() => {
    setFilter(debouncedValue);
  }, [debouncedValue, setFilter]);

  const facets = ['ipAddresses', 'statusCodes', 'techs', 'ports'];
  const isFiltered = facets.some((e: string) => params.has(e));

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2">
        <Input
          placeholder="Filter value"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          className="h-8 w-[200px] lg:w-[300px]"
        />
        <div className="flex gap-x-2">
          <IpFacetedFilter />
          <PortFacetedFilter />
          <TechsFacetedFilter />
          <StatusCodesFacetedFilter />
        </div>
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => {
              for (const facet of facets) {
                params.delete(facet);
              }
              setParams(params);
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
