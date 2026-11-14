import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { menu } from '@/components/common/layout/menu-bar';
import { useAskAi } from '@/components/common/ask-ai-button';
import {
  useSearchControllerSearchAssetsTargets,
  type SearchData,
} from '@/services/apis/gen/queries';
import useDebounce from '@/hooks/use-debounce';
import { keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Bug,
  CloudCheck,
  CornerDownLeft,
  Search,
  Sparkles,
  Target,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/**
 * Global quick switcher: navigation plus targets/assets/findings in one list.
 * Bindings: ⌘K / Ctrl+K toggles, ↑↓ moves, Enter opens, Esc closes (cmdk).
 * No match at all offers "Ask AI", which Enter picks as the only item.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const navigate = useNavigate();
  const askAi = useAskAi();
  const term = query.trim();

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
    { value: debounced.trim(), isSaveHistory: false, limit: 5 },
    {
      query: {
        enabled: open && debounced.trim().length > 0,
        // Keeps the last results on screen while the next term loads
        placeholderData: keepPreviousData,
      },
    },
  );

  const results = (data as { data?: SearchData } | undefined)?.data;

  const pages = useMemo(
    () =>
      menu
        .flatMap((group) => group.items)
        .filter((item) => item.title.toLowerCase().includes(term.toLowerCase()))
        .slice(0, 6),
    [term],
  );

  // Only once the typed term itself came back empty, not while it is loading
  const settled = !isFetching && debounced.trim() === term;
  const hasHits =
    pages.length > 0 ||
    !!results?.targets?.length ||
    !!results?.assets?.length ||
    !!results?.vulnerabilities?.length;
  const noResults =
    term.length > 0 && settled && data?.total === 0 && pages.length === 0;

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
        // Results are already matched by the server and the page filter above;
        // cmdk's fuzzy filter would hide findings matched on other fields.
        shouldFilter={false}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search findings, assets, targets or pages…"
        />
        <CommandList>
          {term.length > 0 && !settled && !hasHits && (
            <p role="status" className="py-6 text-center text-sm">
              Searching…
            </p>
          )}

          {noResults && (
            <CommandGroup heading={`No results for “${term}”`}>
              <CommandItem
                value="ask-ai"
                onSelect={() => go(() => askAi(term))}
              >
                <Sparkles className="size-4 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  Ask AI about “{term}”
                </span>
                <CommandShortcut>Enter</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}

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
        </CommandList>
        <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
          <CornerDownLeft className="size-3.5" aria-hidden />
          Enter opens · Esc closes
          <kbd className="ml-auto font-mono tracking-widest">⌘K</kbd>
        </div>
      </CommandDialog>
    </>
  );
}
