import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import type { AgentHttpRequestListItemDto } from '@/services/apis/gen/queries';
import { formatBytes } from '@/utils/format-bytes';
import {
  ArrowLeftRight,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  displayMethod,
  formatDuration,
  isErrorRequest,
  isTunnel,
  requestName,
  requestUrl,
  waterfall,
  type WaterfallBar,
} from './format';
import { NetworkRequestDetail } from './network-request-detail';
import { StatusCell } from './status-cell';
import type { ConversationHttpRequests } from './use-conversation-http-requests';

type Kind = 'all' | 'errors';

/** A list scrolled within this many px of its end follows new rows */
const STICK_PX = 24;

// One template per width of @container/network: Method joins at 28rem,
// Waterfall at 36rem, so the list never scrolls sideways
const COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_5rem_3.75rem_3.5rem] @md/network:grid-cols-[minmax(0,1fr)_5rem_4.25rem_3.75rem_3.5rem] @xl/network:grid-cols-[minmax(0,1fr)_5rem_4.25rem_3.75rem_3.5rem_minmax(4rem,24%)] items-center gap-x-2';
const METHOD_CELL = 'hidden @md/network:block';
const WATERFALL_CELL = 'hidden @xl/network:block';

export type NetworkData = Pick<
  ConversationHttpRequests,
  | 'requests'
  | 'errorCount'
  | 'data'
  | 'isLoading'
  | 'isError'
  | 'isFetching'
  | 'hasNextPage'
  | 'isFetchingNextPage'
  | 'fetchNextPage'
  | 'refetch'
>;

export interface NetworkToolCallFilter {
  toolCallId: string;
  /** The command, to name the filter */
  command: string;
}

function SkeletonRows() {
  return (
    <div className="space-y-px" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={cn(COLUMNS, 'h-9 px-3')}>
          <div className="space-y-1">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-3 w-8" />
          <Skeleton className={cn('h-3 w-10', METHOD_CELL)} />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-9" />
          <Skeleton className={cn('h-2 w-full', WATERFALL_CELL)} />
        </div>
      ))}
    </div>
  );
}

function Waterfall({ bar, error }: { bar?: WaterfallBar; error: boolean }) {
  if (!bar) return null;
  return (
    <div className={cn('relative h-1.5 rounded-full bg-muted/60', WATERFALL_CELL)}>
      <div
        className={cn(
          'absolute inset-y-0 rounded-full',
          error ? 'bg-red-500/70' : 'bg-sky-500/80',
        )}
        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
      />
    </div>
  );
}

interface RequestRowProps {
  request: AgentHttpRequestListItemDto;
  bar?: WaterfallBar;
  selected: boolean;
  onOpen: (request: AgentHttpRequestListItemDto) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function RequestRow({
  request,
  bar,
  selected,
  onOpen,
  onKeyDown,
}: RequestRowProps) {
  const error = isErrorRequest(request);
  const tunnel = isTunnel(request);
  return (
    <li className="even:bg-muted/25">
      <button
        type="button"
        data-request-id={request.id}
        aria-current={selected || undefined}
        onClick={() => onOpen(request)}
        onKeyDown={onKeyDown}
        title={requestUrl(request)}
        className={cn(
          COLUMNS,
          'w-full cursor-pointer px-3 py-1 text-left font-mono text-[11px] tabular-nums transition-colors outline-none',
          'hover:bg-muted/70 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
          error && 'bg-red-500/[0.06] text-red-600 hover:bg-red-500/10 dark:text-red-400',
          selected && 'bg-primary/10 hover:bg-primary/15',
        )}
      >
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1">
            {tunnel && (
              <Lock className="size-3 shrink-0 opacity-60" aria-hidden />
            )}
            <span className="truncate font-medium">{requestName(request)}</span>
          </span>
          <span
            className={cn(
              'block truncate font-sans text-[10px]',
              error ? 'opacity-75' : 'text-muted-foreground',
            )}
          >
            <span className="@md/network:hidden">
              {displayMethod(request.method)} ·{' '}
            </span>
            {request.host}
          </span>
        </span>
        <StatusCell request={request} className="truncate" />
        <span className={cn('truncate', METHOD_CELL)}>
          {displayMethod(request.method)}
        </span>
        <span className="truncate text-right">
          {formatBytes(request.responseBytes)}
        </span>
        <span className="truncate text-right">
          {formatDuration(request.durationMs)}
        </span>
        <Waterfall bar={bar} error={error} />
      </button>
    </li>
  );
}

// A pushed row re-renders only the rows whose bar moved. `bar` is compared by
// value: the waterfall map is rebuilt on every change.
const MemoRequestRow = memo(
  RequestRow,
  (a, b) =>
    a.request === b.request &&
    a.selected === b.selected &&
    a.onOpen === b.onOpen &&
    a.onKeyDown === b.onKeyDown &&
    a.bar?.left === b.bar?.left &&
    a.bar?.width === b.bar?.width,
);

/** Moves focus between rows with the arrow keys, Home and End */
function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
  const rows = Array.from(
    event.currentTarget
      .closest('ul')
      ?.querySelectorAll<HTMLButtonElement>('button[data-request-id]') ?? [],
  );
  const at = rows.indexOf(event.currentTarget);
  const next =
    event.key === 'ArrowDown'
      ? rows[at + 1]
      : event.key === 'ArrowUp'
        ? rows[at - 1]
        : event.key === 'Home'
          ? rows[0]
          : event.key === 'End'
            ? rows[rows.length - 1]
            : undefined;
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/**
 * The conversation's HTTP requests as Chrome DevTools' Network panel shows
 * them, sized for the side panel: oldest first, following new rows while
 * scrolled to the end, with a request's details opening in its place.
 */
export function NetworkPanel({
  network,
  toolCallFilter,
  onClearToolCallFilter,
  onShowInChat,
}: {
  network: NetworkData;
  toolCallFilter?: NetworkToolCallFilter | null;
  onClearToolCallFilter?: () => void;
  onShowInChat?: (toolCallId: string) => void;
}) {
  const t = useT();
  const {
    requests,
    errorCount: totalErrors,
    data,
    isLoading,
    isError,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = network;
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  // The row itself, not its id: a reload that no longer lists it (the run
  // ended and the list came back as one page) must not close its details
  const [opened, setOpened] = useState<AgentHttpRequestListItemDto | null>(null);
  const [lastOpenedId, setLastOpenedId] = useState<string | null>(null);

  // The tab was just opened: show what is there now
  const isFetchingRef = useRef(isFetching);
  useEffect(() => {
    if (!isFetchingRef.current) void refetch();
  }, [refetch]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter(
      (r) =>
        (!toolCallFilter || r.toolCallId === toolCallFilter.toolCallId) &&
        (kind === 'all' || isErrorRequest(r)) &&
        (!needle || requestUrl(r).toLowerCase().includes(needle)),
    );
  }, [requests, query, kind, toolCallFilter]);
  const bars = useMemo(() => waterfall(visible), [visible]);
  const transferred = visible.reduce((sum, r) => sum + r.responseBytes, 0);
  const filtered = visible.length !== requests.length;
  const errorCount = filtered
    ? visible.filter(isErrorRequest).length
    : totalErrors;
  // Only the loaded pages are counted
  const more = hasNextPage ? '+' : '';

  // The listed copy when there is one, so the details follow its updates
  const selected = opened
    ? (requests.find((r) => r.id === opened.id) ?? opened)
    : undefined;

  const open = useCallback((request: AgentHttpRequestListItemDto) => {
    setOpened(request);
    setLastOpenedId(request.id);
  }, []);

  // Follow new rows while scrolled to the end, as DevTools does
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [visible.length, selected]);

  // Focus follows the view: into the details, then back to the row
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) {
      backRef.current?.focus();
    } else if (lastOpenedId) {
      listRef.current
        ?.querySelector<HTMLButtonElement>(
          `button[data-request-id="${CSS.escape(lastOpenedId)}"]`,
        )
        ?.focus();
    }
    // Only when the view switches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!selected]);

  if (selected) {
    return (
      <NetworkRequestDetail
        request={selected}
        backRef={backRef}
        onBack={() => setOpened(null)}
        onShowInChat={onShowInChat}
      />
    );
  }

  const loadOlder = (
    <button
      type="button"
      onClick={() => void fetchNextPage()}
      disabled={isFetchingNextPage}
      className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 border-b text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-default"
    >
      {isFetchingNextPage && <Loader2 className="size-3 animate-spin" />}
      {t('agents.network.loadOlder')}
    </button>
  );

  return (
    <div className="@container/network flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('agents.network.filter')}
            placeholder={t('agents.network.filterPlaceholder')}
            className="h-7 w-full min-w-0 rounded-md border border-input bg-transparent pr-2 pl-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
        </div>
        <div
          role="group"
          aria-label={t('agents.network.kind')}
          className="flex shrink-0 rounded-md bg-muted p-0.5"
        >
          {(['all', 'errors'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                'h-6 cursor-pointer rounded-[5px] px-2 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
                kind === value && 'bg-background text-foreground shadow-xs',
              )}
            >
              {t(`agents.network.${value}`)}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground"
          aria-label={t('agents.network.refresh')}
          title={t('agents.network.refresh')}
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn(isFetching && 'animate-spin')} />
        </Button>
      </div>

      {toolCallFilter && (
        <div className="flex shrink-0 items-center border-b px-3 py-1.5">
          <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md bg-accent py-0.5 pr-0.5 pl-2 text-xs text-accent-foreground">
            <span className="truncate font-mono" title={toolCallFilter.command}>
              {t('agents.network.commandFilter', {
                command: toolCallFilter.command,
              })}
            </span>
            <button
              type="button"
              aria-label={t('agents.network.clearCommandFilter')}
              title={t('agents.network.clearCommandFilter')}
              onClick={onClearToolCallFilter}
              className="shrink-0 cursor-pointer rounded-sm p-0.5 hover:bg-background/60"
            >
              <X className="size-3" />
            </button>
          </span>
        </div>
      )}

      {/* A failed poll keeps the rows already shown; only say so inline */}
      {isError && data && (
        <p
          role="status"
          className="shrink-0 border-b bg-red-500/5 px-3 py-1 text-[11px] text-red-600 dark:text-red-400"
        >
          {t('agents.network.loadFailed')}
        </p>
      )}

      {isError && !data ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {t('agents.network.loadFailed')}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t('agents.network.refresh')}
          </Button>
        </div>
      ) : !isLoading && requests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="rounded-xl bg-muted p-3 ring-1 ring-border">
            <ArrowLeftRight className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('agents.network.emptyTitle')}</p>
            <p className="text-sm text-muted-foreground">
              {t('agents.network.emptyHint')}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div
            aria-hidden
            className={cn(
              COLUMNS,
              'h-7 shrink-0 border-b bg-muted/40 px-3 text-[11px] font-medium text-muted-foreground',
            )}
          >
            <span className="truncate">{t('agents.network.col.name')}</span>
            <span className="truncate">{t('agents.network.col.status')}</span>
            <span className={cn('truncate', METHOD_CELL)}>
              {t('agents.network.col.method')}
            </span>
            <span className="truncate text-right">
              {t('agents.network.col.size')}
            </span>
            <span className="truncate text-right">
              {t('agents.network.col.time')}
            </span>
            <span className={cn('truncate', WATERFALL_CELL)}>
              {t('agents.network.col.waterfall')}
            </span>
          </div>
          <div
            ref={listRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
            }}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {hasNextPage && (isLoading || visible.length > 0) && loadOlder}
            {isLoading ? (
              <SkeletonRows />
            ) : visible.length === 0 ? (
              <>
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                  {t('agents.network.emptyFiltered')}
                </p>
                {/* The match may be among the requests not loaded yet */}
                {hasNextPage && loadOlder}
              </>
            ) : (
              <ul aria-label={t('agents.network.requests')}>
                {visible.map((request) => (
                  <MemoRequestRow
                    key={request.id}
                    request={request}
                    bar={bars.get(request.id)}
                    selected={request.id === lastOpenedId}
                    onOpen={open}
                    onKeyDown={moveFocus}
                  />
                ))}
              </ul>
            )}
          </div>
          <div className="flex h-7 shrink-0 items-center gap-3 border-t px-3 text-[11px] text-muted-foreground">
            <span className="truncate tabular-nums">
              {filtered
                ? t('agents.network.summaryFiltered', {
                    shown: visible.length,
                    count: `${requests.length}${more}`,
                    size: formatBytes(transferred),
                  })
                : t('agents.network.summary', {
                    count: `${requests.length}${more}`,
                    size: formatBytes(transferred),
                  })}
            </span>
            {errorCount > 0 && (
              <span className="ml-auto shrink-0 text-red-600 tabular-nums dark:text-red-400">
                {t('agents.network.errorCount', { count: `${errorCount}${more}` })}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
