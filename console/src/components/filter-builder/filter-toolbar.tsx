import { useState } from 'react';
import { Filter as FilterIcon, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { FilterBuilder } from './filter-builder';
import { countConditions, filterToText, type Filter, type FilterFieldConfig } from './filter-model';

interface Props {
  fields: FilterFieldConfig[];
  value: Filter | undefined;
  onApply: (f: Filter | undefined) => void;
  /** Omit when the API has no free-text search; the box then just opens the builder. */
  search?: string;
  onSearchChange?: (s: string) => void;
  flat?: boolean;
}

export function FilterToolbar({ fields, value, onApply, search = '', onSearchChange, flat }: Props) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const count = countConditions(value);
  const apply = (f: Filter | undefined) => { onApply(f); setOpen(false); };
  const builder = (
    <FilterBuilder fields={fields} value={value} onApply={apply} onCancel={() => setOpen(false)} flat={flat} className="flex-1" />
  );

  // On mobile the builder opens in a bottom sheet: an anchored popover overflows a phone screen and jumps
  // when the keyboard opens. The Popover stays mounted (closed) so its trigger still drives `open`.
  return (
    <Popover modal open={open && !isMobile} onOpenChange={setOpen}>
      <div className="flex w-full min-w-0 items-center gap-2">
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 shrink-0">
            <FilterIcon className="size-4" /> Add filter
            {count > 0 && <Badge className="ml-1 rounded-full px-1.5">{count}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverAnchor asChild>
          <div className="relative flex h-9 min-w-0 flex-1 items-center rounded-md border border-input bg-transparent px-2 dark:bg-input/30">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            {count > 0 ? (
              <button type="button" className="min-w-0 flex-1 truncate px-2 text-left font-mono text-sm"
                title={filterToText(value!, fields)} onClick={() => setOpen(true)}>
                {filterToText(value!, fields)}
              </button>
            ) : !onSearchChange ? (
              <button type="button" className="min-w-0 flex-1 truncate px-2 text-left text-sm text-muted-foreground"
                onClick={() => setOpen(true)}>
                No filters applied
              </button>
            ) : (
              <input aria-label="Search" placeholder="Search value"
                className="h-8 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
                value={search} onChange={(e) => onSearchChange(e.target.value)} />
            )}
            {(count > 0 || search) && (
              <Button variant="ghost" size="icon" className="size-7" aria-label="Clear filters"
                onClick={() => (count > 0 ? onApply(undefined) : onSearchChange?.(''))}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        </PopoverAnchor>
      </div>
      <PopoverContent align="start" className="flex max-h-(--radix-popover-content-available-height) w-[min(44rem,calc(100vw-2rem))] flex-col">
        {builder}
      </PopoverContent>
      <Sheet open={open && isMobile} onOpenChange={setOpen}>
        <SheetContent side="bottom" aria-describedby={undefined} className="max-h-[85dvh] gap-0 rounded-t-xl px-4 pb-4">
          <SheetHeader className="px-0 pt-4 pb-3">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          {builder}
        </SheetContent>
      </Sheet>
    </Popover>
  );
}
