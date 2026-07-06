import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTargetsControllerGetTargetsInWorkspace } from '@/services/apis/gen/queries';
import useDebounce from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { ChevronDown, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

interface TargetFilterProps {
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
}

export function TargetFilter({ value, onValueChange }: TargetFilterProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 500);

  const { data, isLoading } = useTargetsControllerGetTargetsInWorkspace(
    { limit: 100, value: debouncedSearch || undefined },
    {
      query: {
        queryKey: ['targets-for-vuln-filter', debouncedSearch],
      },
    },
  );

  const targets = useMemo(() => data?.data ?? [], [data?.data]);

  const selectedTarget = useMemo(
    () => targets.find((t) => t.id === value),
    [targets, value],
  );

  const hasSelection = !!value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 border-dashed py-0 text-xs justify-between min-w-[140px]',
            hasSelection && 'border-solid border-primary',
          )}
        >
          {selectedTarget ? (
            <span className="truncate max-w-[100px]">{selectedTarget.value}</span>
          ) : (
            'Target'
          )}
          {hasSelection ? (
            <X
              className="ml-2 h-3.5 w-3.5 cursor-pointer hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onValueChange(undefined);
              }}
            />
          ) : (
            <ChevronDown className="ml-2 h-3.5 w-3.5" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search targets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-7"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {isLoading ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Loading...
              </div>
            ) : targets.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No targets found
              </div>
            ) : (
              targets.map((target) => (
                <div
                  key={target.id}
                  className={cn(
                    'flex items-center rounded-sm px-2 py-1.5 cursor-pointer hover:bg-accent text-sm',
                    value === target.id && 'bg-accent/50',
                  )}
                  onClick={() => {
                    onValueChange(
                      value === target.id ? undefined : target.id,
                    );
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <span className="truncate">{target.value}</span>
                </div>
              ))
            )}
          </div>
          {hasSelection && (
            <div className="pt-1 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onValueChange(undefined);
                  setOpen(false);
                  setSearch('');
                }}
              >
                Clear filter
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
