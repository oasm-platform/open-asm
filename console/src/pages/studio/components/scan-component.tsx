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
  useAssetsControllerGetAssetsInWorkspaceInfinite,
  useTemplatesControllerRunTemplate,
} from '@/services/apis/gen/queries';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, CirclePlus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Template } from '../atoms';

// const assetIdsAtom = atom<string[]>([]);

export interface ScanComponentProps {
  template: Template;
}
export function ScanComponent({ template }: ScanComponentProps) {
  const { mutate } = useTemplatesControllerRunTemplate();
  // const assetIds = useAtomValue(assetIdsAtom);
  const [assetIds, setAssetIds] = useState<string[]>([]);

  const handleScan = () => {
    mutate({ data: { assetIds: assetIds, templateId: template.id } });
  };

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, isFetching } =
    useAssetsControllerGetAssetsInWorkspaceInfinite(
      { value: value },
      {
        query: {
          getNextPageParam: (lastGroup) =>
            lastGroup.hasNextPage ? lastGroup.page + 1 : undefined,
          enabled: open,
          select: (res) => {
            const items = res?.pages.flatMap((page) => page.data) || [];
            return items.map((e) => ({
              value: e.id ?? '',
              label: e.value ?? '',
            }));
          },
        },
      },
    );
  const options = useMemo(() => data ?? [], [data]);

  return (
    <div className="flex items-center gap-2 p-4 border-b">
      <div className="flex gap-2 items-center">
        <FacetedFilterTemplate
          setValue={setValue}
          open={open}
          setOpen={setOpen}
          title="Assets"
          options={options}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isFetching={isFetching}
          assetIds={assetIds}
          setAssetIds={setAssetIds}
        />
      </div>
      <Button
        onClick={handleScan}
        className="flex items-center gap-2"
        disabled={assetIds.length === 0}
      >
        <Search className="size-4" />
        Scan
      </Button>
    </div>
  );
}

interface FacetedFilterTemplateProps {
  title: string;
  options: {
    value: string;
    label: string;
  }[];
  hasNextPage: boolean | undefined;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  isFetching: boolean;
  open: boolean;
  assetIds: string[];
  setAssetIds: (value: string[]) => void;
  setValue: (value: string) => void;
  setOpen: (value: boolean) => void;
}

function FacetedFilterTemplate({
  title,
  options,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  isFetching,
  open,
  setOpen,
  setValue,
  assetIds,
  setAssetIds,
}: FacetedFilterTemplateProps) {
  const parentRef = useRef(null);

  // const [assetIds, setAssetIds] = useAtom(assetIdsAtom);

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

  const selectedValues = new Set(assetIds);

  const handleFilterChange = (value: number | string) => {
    if (selectedValues.has(value.toString())) {
      selectedValues.delete(value.toString());
    } else {
      selectedValues.add(value.toString());
    }
    setAssetIds(Array.from(selectedValues));
  };

  const handleClearFilters = () => {
    selectedValues.clear();
    setAssetIds(Array.from(selectedValues));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="default" className="border-dashed">
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
      <PopoverContent className="w-[400px] p-0" align="start">
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
