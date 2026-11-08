import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { menu } from '@/components/common/layout/menu-bar';
import {
  useSearchControllerSearchAssetsTargets,
  type SearchData,
} from '@/services/apis/gen/queries';
import useDebounce from '@/hooks/use-debounce';
import { useNavigate } from '@tanstack/react-router';
import { Bug, CloudCheck, CornerDownLeft, Search, Target } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/**
 * Global quick switcher: navigation plus targets/assets/findings in one list.
 * Bindings: ⌘K / Ctrl+K toggles, ↑↓ moves, Enter opens, Esc closes (cmdk).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === 'k' &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const { data, isFetching } = useSearchControllerSearchAssetsTargets(
    { value: debounced, isSaveHistory: false, limit: 5 },
    { query: { enabled: open && debounced.trim().length > 0 } },
  );

  const results = (data as { data?: SearchData } | undefined)?.data;

  const pages = useMemo(
    () =>
      menu
        .flatMap((group) => group.items)
        .filter((item) =>
          item.title.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 6),
    [query],
  );

  const go = (run: () => void) => {
    setOpen(false);
    setQuery('');
    run();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className="flex size-9 items-center justify-center gap-2 rounded-md border border-border/60 bg-muted/40 text-xs text-muted-foreground transition-colors hover:bg-muted md:h-8 md:w-full md:max-w-xs md:justify-start md:px-2 md:text-left"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden flex-1 md:inline">Search or jump to…</span>
        <kbd className="hidden rounded border bg-background px-1 font-mono text-[10px] md:inline">
          Ctrl K
        </kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command palette"
        description="Search findings, assets, targets or jump to a page"
        className="sm:max-w-xl"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search findings, assets, targets or pages…"
        />
        <CommandList>
          <CommandEmpty>
            {isFetching ? 'Searching…' : 'No results found.'}
          </CommandEmpty>

          {pages.length > 0 && (
            <CommandGroup heading="Pages">
              {pages.map((item) => (
                <CommandItem
                  key={item.url}
                  value={`page ${item.title}`}
                  onSelect={() => go(() => navigate({ to: item.url }))}
                >
                  <span className="size-4 [&>svg]:size-4">{item.icon}</span>
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!!results?.targets?.length && (
            <CommandGroup heading="Targets">
              {results.targets.map((target) => (
                <CommandItem
                  key={target.id}
                  value={`target ${target.value}`}
                  onSelect={() =>
                    go(() =>
                      navigate({
                        to: '/targets/$id/$tab',
                        params: { id: target.id, tab: 'overview' },
                      }),
                    )
                  }
                >
                  <Target className="size-4" aria-hidden />
                  {target.value}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!!results?.assets?.length && (
            <CommandGroup heading="Assets">
              {results.assets.map((asset) => (
                <CommandItem
                  key={asset.id}
                  value={`asset ${asset.value}`}
                  onSelect={() =>
                    go(() =>
                      navigate({
                        to: '/assets/services/$id',
                        params: { id: asset.id },
                      }),
                    )
                  }
                >
                  <CloudCheck className="size-4" aria-hidden />
                  {asset.value}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!!results?.vulnerabilities?.length && (
            <CommandGroup heading="Findings">
              {results.vulnerabilities.map((vulnerability) => (
                <CommandItem
                  key={vulnerability.id}
                  value={`finding ${vulnerability.name}`}
                  onSelect={() =>
                    go(() =>
                      navigate({
                        to: '/vulnerabilities/$id',
                        params: { id: vulnerability.id },
                      }),
                    )
                  }
                >
                  <Bug className="size-4" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {vulnerability.name}
                  </span>
                  <span className="text-xs capitalize text-muted-foreground">
                    {vulnerability.severity}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />
          <CommandGroup heading="Tip">
            <CommandItem disabled>
              <CornerDownLeft className="size-4" aria-hidden />
              Enter opens · Esc closes
              <CommandShortcut>⌘K</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
