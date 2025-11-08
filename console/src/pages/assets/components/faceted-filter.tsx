import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  useAssetsControllerGetIpAssetsInfinite,
  useAssetsControllerGetPortAssetsInfinite,
  useAssetsControllerGetStatusCodeAssetsInfinite,
  useAssetsControllerGetTechnologyAssetsInfinite,
} from '@/services/apis/gen/queries';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, CirclePlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAsset } from '../context/asset-context';

interface FacetedFilterTemplateProps {
  title: string;
  filterKey: string;
  options: {
    value: string;
    label: string;
  }[];
  hasNextPage: boolean | undefined;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  isFetching: boolean;
  paramValues?: string[];
  open: boolean;
  setValue: (value: string) => void;
  setOpen: (value: boolean) => void;
}

function FacetedFilterTemplate({
  title,
  filterKey,
  options,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  isFetching,
  paramValues,
  open,
  setOpen,
  setValue,
}: FacetedFilterTemplateProps) {
  const parentRef = useRef(null);

  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? options.length + 1 : options.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (
      lastItem &&
      lastItem.index >= options.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    virtualItems,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    options.length,
  ]);

  const selectedValues = useMemo(() => new Set(paramValues), [paramValues]);
  const { filterHandlers } = useAsset();

  const handleFilterChange = (value: number | string) => {
    if (selectedValues.has(value.toString())) {
      selectedValues.delete(value.toString());
    } else {
      selectedValues.add(value.toString());
    }
    filterHandlers(filterKey, Array.from(selectedValues));
  };

  const handleClearFilters = () => {
    filterHandlers(filterKey, []);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <CirclePlus className="size-4" />
          {title}
          {selectedValues.size > 0 && (
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
                      selectedValues.has(option?.value?.toString()),
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
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={title}
            onChangeCapture={(e) => setValue(e.currentTarget.value)}
          />

          {options.length === 0 && !isFetching && (
            <div className="p-2 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          )}

          <div
            ref={parentRef}
            style={{
              height: `200px`,
              overflow: 'auto',
            }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualItems.map((virtualRow) => {
                const isLoaderRow = virtualRow.index > options.length - 1;
                const option = options[virtualRow.index];
                const isSelected = selectedValues.has(
                  option?.value?.toString(),
                );

                return (
                  <CommandItem
                    key={isLoaderRow ? 'loader' : virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onSelect={() => {
                      if (!isLoaderRow) {
                        handleFilterChange(option.value);
                      }
                    }}
                  >
                    {isLoaderRow ? (
                      <div className="flex w-full justify-center">
                        {hasNextPage
                          ? 'Loading more...'
                          : 'Nothing more to load'}
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
                  </CommandItem>
                );
              })}
            </div>
            {isFetching && !isFetchingNextPage && (
              <div className="p-2 text-center text-sm text-muted-foreground">
                Background Updating...
              </div>
            )}
          </div>

          {selectedValues.size > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={handleClearFilters}
                  className="justify-center text-center"
                >
                  Clear filters
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function IpFacetedFilter() {
  const [open, setOpen] = useState(false);
  const { filterParams } = useAsset();
  const [value, setValue] = useState('');

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, isFetching } =
    useAssetsControllerGetIpAssetsInfinite(
      { ...filterParams, value: value },
      {
        query: {
          getNextPageParam: (lastGroup) =>
            lastGroup.hasNextPage ? lastGroup.page + 1 : undefined,
          enabled: open,
          select: (res) => {
            const items = res?.pages.flatMap((page) => page.data) || [];
            return items.map((e) => ({
              value: e.ip?.toString() ?? '',
              label: e.ip?.toString() ?? '',
            }));
          },
        },
      },
    );
  const options = useMemo(() => data ?? [], [data]);
  return (
    <FacetedFilterTemplate
      open={open}
      setOpen={setOpen}
      setValue={setValue}
      paramValues={filterParams.ipAddresses}
      title="IP"
      filterKey="ipAddresses"
      options={options}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      isFetching={isFetching}
    />
  );
}

export function PortFacetedFilter() {
  const [open, setOpen] = useState(false);
  const { filterParams } = useAsset();
  const { queryFilterParams } = useAsset();
  const [value, setValue] = useState('');

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, isFetching } =
    useAssetsControllerGetPortAssetsInfinite(
      { ...queryFilterParams, value: value },
      {
        query: {
          getNextPageParam: (lastGroup) =>
            lastGroup.hasNextPage ? lastGroup.page + 1 : undefined,
          enabled: open,
          select: (res) => {
            const items = res?.pages.flatMap((page) => page.data) || [];
            return items.map((e) => ({
              value: e.port?.toString() ?? '',
              label: e.port?.toString() ?? '',
            }));
          },
        },
      },
    );
  const options = useMemo(() => data ?? [], [data]);
  return (
    <FacetedFilterTemplate
      setValue={setValue}
      open={open}
      setOpen={setOpen}
      paramValues={filterParams.ports}
      title="Port"
      filterKey="ports"
      options={options}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      isFetching={isFetching}
    />
  );
}

export function TechsFacetedFilter() {
  const [open, setOpen] = useState(false);
  const { filterParams } = useAsset();
  const { queryFilterParams } = useAsset();
  const [value, setValue] = useState('');
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, isFetching } =
    useAssetsControllerGetTechnologyAssetsInfinite(
      { ...queryFilterParams, value: value },
      {
        query: {
          getNextPageParam: (lastGroup) =>
            lastGroup.hasNextPage ? lastGroup.page + 1 : undefined,
          enabled: open,
          select: (res) => {
            const items = res?.pages.flatMap((page) => page.data) || [];
            return items.map((e) => ({
              value: e.technology?.name?.toString() ?? '',
              label: e.technology?.name?.toString() ?? '',
            }));
          },
        },
      },
    );
  const options = useMemo(() => data ?? [], [data]);
  return (
    <FacetedFilterTemplate
      setValue={setValue}
      open={open}
      setOpen={setOpen}
      paramValues={filterParams.techs}
      title="Technology"
      filterKey="techs"
      options={options}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      isFetching={isFetching}
    />
  );
}

export function StatusCodesFacetedFilter() {
  const [open, setOpen] = useState(false);
  const { filterParams } = useAsset();
  const { queryFilterParams } = useAsset();
  const [value, setValue] = useState('');
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, isFetching } =
    useAssetsControllerGetStatusCodeAssetsInfinite(
      { ...queryFilterParams, value: value },
      {
        query: {
          getNextPageParam: (lastGroup) =>
            lastGroup.hasNextPage ? lastGroup.page + 1 : undefined,
          enabled: open,
          select: (res) => {
            const items = res?.pages.flatMap((page) => page.data) || [];
            return items.map((e) => ({
              value: e.statusCode?.toString() ?? '',
              label: e.statusCode?.toString() ?? '',
            }));
          },
        },
      },
    );
  const options = useMemo(() => data ?? [], [data]);
  return (
    <FacetedFilterTemplate
      setValue={setValue}
      open={open}
      setOpen={setOpen}
      paramValues={filterParams.statusCodes}
      title="Status Code"
      filterKey="statusCodes"
      options={options}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      isFetching={isFetching}
    />
  );
}
