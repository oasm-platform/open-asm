import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import useDebounce from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { useAssetsControllerGetFacetedData } from '@/services/apis/gen/queries';
import { Check, CirclePlus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsset } from '../context/asset-context';

export default function FilterForm() {
  const [params, setParams] = useSearchParams();
  const {
    tableParams: { filter },
    tableHandlers: { setFilter },
    queryParams,
    filterParams: { ipAddresses, ports, techs },
  } = useAsset();

  const [searchValue, setSearchValue] = useState(filter ?? '');
  const debouncedValue = useDebounce(searchValue, 500);

  useEffect(() => {
    setFilter(debouncedValue);
  }, [debouncedValue, setFilter]);

  const { data } = useAssetsControllerGetFacetedData(queryParams);

  const filters = useMemo(
    () => [
      {
        filterKey: 'ipAddresses',
        title: 'IP',
        options: data?.ipAddresses.map((e) => {
          return {
            value: e,
            label: e,
          };
        }),
        selectedValues: ipAddresses,
      },
      {
        filterKey: 'ports',
        title: 'Port',
        options: data?.ports.map((e) => {
          return {
            value: e,
            label: e,
          };
        }),
        selectedValues: ports,
      },
      {
        filterKey: 'techs',
        title: 'Technology',
        options: data?.techs.map((e) => {
          return {
            value: e,
            label: e,
          };
        }),
        selectedValues: techs,
      },
    ],
    [data?.ipAddresses, data?.ports, data?.techs, ipAddresses, ports, techs],
  );

  const facets = filters.map((filter) => filter.filterKey);
  const isFiltered = facets.some((e) => params.has(e));

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
          {filters.map((filter) => (
            <FacetedFilter
              key={filter.filterKey}
              title={filter.title}
              filterKey={filter.filterKey}
              options={filter.options ?? []}
              selectedValue={filter.selectedValues}
            />
          ))}
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

interface FacetedFilterProps {
  title: string;
  filterKey: string;
  options: {
    value: string;
    label: string;
  }[];
  selectedValue?: string[];
}

function FacetedFilter({
  title,
  filterKey,
  options,
  selectedValue,
}: FacetedFilterProps) {
  const { filterHandlers } = useAsset();
  const selectedValues = new Set(selectedValue);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <CirclePlus className="size-4" />
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValues.size}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) =>
                      selectedValues.has(option.value.toString()),
                    )
                    .map((option) => (
                      <Badge
                        variant="secondary"
                        key={option.value}
                        className="rounded-sm px-1 font-normal"
                      >
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value.toString());
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        selectedValues.delete(option.value.toString());
                      } else {
                        selectedValues.add(option.value.toString());
                      }
                      filterHandlers(filterKey, Array.from(selectedValues));
                    }}
                  >
                    <div
                      className={cn(
                        'border-primary flex size-4 items-center justify-center rounded-sm border',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className={cn('text-background h-4 w-4')} />
                    </div>
                    <span>{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      filterHandlers(filterKey, []);
                    }}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
