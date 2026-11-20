import { type TFunction, useT } from '@/lib/i18n-dictionary';
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
  ASK_PROMPT_GROUPS,
  translatePromptGroups,
} from '@/pages/agents/components/landing-constants';
import {
  useSearchControllerSearchAssetsTargets,
  type SearchData,
} from '@/services/apis/gen/queries';
import useDebounce from '@/hooks/use-debounce';
import { useTypewriter } from '@/hooks/use-typewriter';
import { keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useReducedMotion } from 'framer-motion';
import {
  Bug,
  CloudCheck,
  CornerDownLeft,
  Search,
  Sparkles,
  Target,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/** What the placeholder types out, so the box shows what it takes */
const SEARCH_HINT_KEYS = [
  'shell.palette.hint.host',
  'shell.palette.hint.cve',
  'shell.palette.hint.technology',
  'shell.palette.hint.page',
  'shell.palette.hint.askAi',
];

function useSearchHints() {
  const t = useT();
  return useMemo(() => SEARCH_HINT_KEYS.map((key) => t(key)), [t]);
}

// Few enough that pages and results still show below them
const AI_SUGGESTION_COUNT = 3;

/** A random few Ask-mode starters, in the current language */
function pickAiSuggestions(t: TFunction): string[] {
  const pool = translatePromptGroups(ASK_PROMPT_GROUPS, t).flatMap(
    (group) => group.prompts,
  );
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, AI_SUGGESTION_COUNT);
}

/** Own component, so each typed character re-renders only the hint */
function TriggerHint({ animate }: { animate: boolean }) {
  const hint = useTypewriter(useSearchHints(), { animate });
  return (
    <span aria-hidden className="hidden flex-1 truncate md:inline">
      {hint}
    </span>
  );
}

interface PaletteInputProps {
  value: string;
  onValueChange: (value: string) => void;
  animate: boolean;
}

function PaletteInput({ value, onValueChange, animate }: PaletteInputProps) {
  // Only types while the placeholder shows
  const hint = useTypewriter(useSearchHints(), {
    animate: animate && value.length === 0,
  });
  return (
    <CommandInput
      value={value}
      onValueChange={onValueChange}
      placeholder={hint}
    />
  );
}

/**
 * Global quick switcher: navigation plus targets/assets/findings in one list.
 * Bindings: ⌘K / Ctrl+K toggles, ↑↓ moves, Enter opens, Esc closes (cmdk).
 * No match at all offers "Ask AI", which Enter picks as the only item; an
 * empty input offers starter questions for the AI instead.
 */
export function CommandPalette() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const navigate = useNavigate();
  const askAi = useAskAi();
  const animate = !useReducedMotion();
  const term = query.trim();

  // A fresh few each time the palette opens, steady while it stays open
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSuggestions(pickAiSuggestions(t));
  }

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
        .filter((item) =>
          t(item.title).toLowerCase().includes(term.toLowerCase()),
        )
        .slice(0, 6),
    [term, t],
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
        aria-label={t('shell.palette.open')}
        // Mobile: a round icon button like the header's AI, theme and
        // notification buttons. From md: a search bar.
        className="flex size-9 shrink-0 scale-95 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 md:w-full md:min-w-0 md:max-w-sm md:shrink md:scale-100 md:justify-start md:gap-2 md:rounded-md md:border md:border-border/60 md:bg-muted/40 md:px-3 md:text-left md:text-sm md:text-muted-foreground md:hover:bg-muted md:hover:text-muted-foreground"
      >
        <Search className="size-5 shrink-0 md:size-4" aria-hidden />
        {/* Paused behind the open dialog */}
        <TriggerHint animate={animate && !open} />
        <kbd className="hidden rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] leading-none md:inline">
          Ctrl K
        </kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t('shell.palette.title')}
        description={t('shell.palette.description')}
        // Mobile (as the icon trigger): the whole screen, not a box in the
        // middle of a small one
        className="sm:max-w-xl max-md:top-0 max-md:left-0 max-md:h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:grid-rows-[minmax(0,1fr)] max-md:rounded-none max-md:border-0"
        // Results are already matched by the server and the page filter above;
        // cmdk's fuzzy filter would hide findings matched on other fields.
        shouldFilter={false}
      >
        <PaletteInput value={query} onValueChange={setQuery} animate={animate} />
        {/* Full screen on mobile: the list takes the height left */}
        <CommandList className="max-md:max-h-none max-md:min-h-0 max-md:flex-1">
          {term.length > 0 && !settled && !hasHits && (
            <p role="status" className="py-6 text-center text-sm">
              {t('shell.palette.searching')}
            </p>
          )}

          {noResults && (
            <CommandGroup heading={t('shell.palette.noResults', { term })}>
              <CommandItem
                value="ask-ai"
                onSelect={() => go(() => askAi(term))}
              >
                <Sparkles className="size-4 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {t('shell.palette.askAbout', { term })}
                </span>
                <CommandShortcut>{t('shell.palette.enter')}</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}

          {term.length === 0 && suggestions.length > 0 && (
            <CommandGroup heading={t('components.askAi.label')}>
              {suggestions.map((prompt) => (
                <CommandItem
                  key={prompt}
                  value={`ask ${prompt}`}
                  onSelect={() => go(() => askAi(prompt))}
                >
                  <Sparkles className="size-4 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{prompt}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {pages.length > 0 && (
            <CommandGroup heading={t('shell.palette.pages')}>
              {pages.map((item) => (
                <CommandItem
                  key={item.url}
                  value={`page ${t(item.title)}`}
                  onSelect={() => go(() => navigate({ to: item.url }))}
                >
                  <span className="size-4 [&>svg]:size-4">{item.icon}</span>
                  {t(item.title)}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!!results?.targets?.length && (
            <CommandGroup heading={t('shell.nav.targets')}>
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
            <CommandGroup heading={t('shell.nav.assets')}>
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
            <CommandGroup heading={t('shell.palette.findings')}>
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
        {/* Key hints: no keyboard to use them on mobile */}
        <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground max-md:hidden">
          <CornerDownLeft className="size-3.5" aria-hidden />
          {t('shell.palette.keyHints')}
          <kbd className="ml-auto font-mono tracking-widest">⌘K</kbd>
        </div>
      </CommandDialog>
    </>
  );
}
