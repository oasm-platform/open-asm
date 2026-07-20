import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  useTargetsControllerGetTargetsInWorkspace,
  type GetManyTargetResponseDto,
} from '@/services/apis/gen/queries';

interface TargetSwitcherProps {
  currentTargetId: string;
  currentTargetValue: string;
}

export function TargetSwitcher({
  currentTargetId,
  currentTargetValue,
}: TargetSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { tab } = useParams({ from: '/_authed/targets/$id/$tab' });
  const navigate = useNavigate();
  const deferredSearch = useDeferredValue(searchQuery);

  const { data, isLoading } = useTargetsControllerGetTargetsInWorkspace(
    {
      limit: 50,
      value: deferredSearch || undefined,
    },
    { query: { enabled: open } },
  );

  const targets = useMemo(() => {
    const list: GetManyTargetResponseDto[] = data?.data ?? [];
    if (!deferredSearch) return list;
    const query = deferredSearch.toLowerCase();
    return list.filter((t) => t.value.toLowerCase().includes(query));
  }, [data, deferredSearch]);

  const handleSelect = useCallback(
    (targetId: string) => {
      if (targetId === currentTargetId) {
        setOpen(false);
        return;
      }
      navigate({
        to: '/targets/$id/$tab',
        params: { id: targetId, tab: tab ?? 'inventory' },
      });
      setOpen(false);
      setSearchQuery('');
    },
    [currentTargetId, navigate, tab],
  );

  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) setSearchQuery('');
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-accent transition-colors"
          aria-label="Switch target"
        >
          <span className="truncate max-w-[300px]">{currentTargetValue}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start" sideOffset={4}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search targets..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-80">
            {isLoading ? (
              <CommandEmpty className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </CommandEmpty>
            ) : targets.length > 0 ? (
              targets.map((target) => (
                <CommandItem
                  key={target.id}
                  value={target.id}
                  onSelect={() => handleSelect(target.id)}
                  className="flex items-center gap-2"
                >
                  <span className="truncate flex-1">{target.value}</span>
                  {target.id === currentTargetId && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </CommandItem>
              ))
            ) : (
              <CommandEmpty>
                {searchQuery ? 'No targets found' : 'No targets available'}
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
