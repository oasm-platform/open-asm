import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import type { AgentHttpRequestListItemDto } from '@/services/apis/gen/queries';
import { formatBytes } from '@/utils/format-bytes';
import {
  ArrowLeftRight,
  ChevronRight,
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
import { MethodBadge } from './method-badge';
import { NetworkRequestDetail } from './network-request-detail';
import { StatusCell } from './status-cell';
import type { ConversationHttpRequests } from './use-conversation-http-requests';

type Kind = 'all' | 'errors';

/** A list scrolled within this many px of its end follows new rows */
const STICK_PX = 24;

// Fold chevron, Method, Name, Status, Size, Time, Waterfall; one template per
// width of @container/network: Method joins at 28rem, Waterfall at 36rem,
// so the list never scrolls sideways. Every column reads from the left
const COLUMNS =
  'grid grid-cols-[0.875rem_minmax(0,1fr)_5rem_4.5rem_4.5rem] @md/network:grid-cols-[0.875rem_4.75rem_minmax(0,1fr)_5rem_4.5rem_4.5rem] @xl/network:grid-cols-[0.875rem_4.75rem_minmax(0,1fr)_5rem_4.5rem_4.5rem_minmax(4rem,24%)] items-center gap-x-3 text-left';
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
        <div key={i} className={cn(COLUMNS, 'h-12 border-b border-border/60 px-3')}>
          <Skeleton className="size-3.5" />
          <Skeleton className={cn('h-5 w-12', METHOD_CELL)} />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-10" />
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-3.5 w-10" />
          <Skeleton className={cn('h-1.5 w-full', WATERFALL_CELL)} />
        </div>
      ))}
    </div>
  );
}

function Waterfall({ bar, error }: { bar?: WaterfallBar; error: boolean }) {
  if (!bar) return null;
  return (
    <div className={cn('relative h-1.5 rounded-full bg-muted', WATERFALL_CELL)}>
      <div
        className={cn(
          'absolute inset-y-0 rounded-full',
          error ? 'bg-destructive/70' : 'bg-primary/70',
        )}
        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
      />
    </div>
  );
}

interface RequestRowProps {
  request: AgentHttpRequestListItemDto;
  bar?: WaterfallBar;
  expanded: boolean;
  onToggle: (id: string, open: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onShowInChat?: (toolCallId: string) => void;
}

/** A request row that unfolds its details under itself */
function RequestRow({
  request,
  bar,
  expanded,
  onToggle,
  onKeyDown,
  onShowInChat,
}: RequestRowProps) {
  const error = isErrorRequest(request);
  const tunnel = isTunnel(request);
  return (
    <li className="border-b border-border/60">
      <Collapsible
        open={expanded}
        onOpenChange={(open) => onToggle(request.id, open)}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            data-request-id={request.id}
            onKeyDown={onKeyDown}
            title={requestUrl(request)}
            className={cn(
              COLUMNS,
              'group w-full cursor-pointer px-3 py-1.5 text-sm tabular-nums transition-colors outline-none',
              'hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
              error && 'bg-destructive/5 text-destructive hover:bg-destructive/10',
              'data-[state=open]:bg-muted/60',
            )}
          >
            <ChevronRight
              className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90"
              aria-hidden
            />
            <span className={cn('min-w-0', METHOD_CELL)}>
              <MethodBadge method={request.method} />
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-1.5">
                {tunnel && (
                  <Lock className="size-3.5 shrink-0 opacity-60" aria-hidden />
                )}
                <span className="truncate font-medium">{requestName(request)}</span>
              </span>
              <span
                className={cn(
                  'block truncate text-xs',
                  error ? 'opacity-75' : 'text-muted-foreground',
                )}
              >
                {/* Below 28rem the Method column is hidden */}
                <span className="@md/network:hidden">
                  {displayMethod(request.method)} ·{' '}
                </span>
                {request.host}
              </span>
            </span>
            <span className="min-w-0">
              <StatusCell request={request} />
            </span>
            <span className="truncate">
              {formatBytes(request.responseBytes)}
            </span>
            <span className="truncate">
              {formatDuration(request.durationMs)}
            </span>
            <Waterfall bar={bar} error={error} />
          </button>
        </CollapsibleTrigger>
        {/* Unmounted while folded, so the details load on first unfold */}
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <NetworkRequestDetail request={request} onShowInChat={onShowInChat} />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

// A pushed row re-renders only the rows whose bar moved. `bar` is compared by
// value: the waterfall map is rebuilt on every change.
const MemoRequestRow = memo(
  RequestRow,
  (a, b) =>
    a.request === b.request &&
    a.expanded === b.expanded &&
    a.onToggle === b.onToggle &&
    a.onKeyDown === b.onKeyDown &&
    a.onShowInChat === b.onShowInChat &&
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
 * scrolled to the end, each request unfolding its details under its row.
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
  // By id: a row a reload drops (the run ended and the list came back as one
  // page) unfolds again when loading older requests brings it back
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

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

  const toggle = useCallback((id: string, open: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Follow new rows while scrolled to the end, as DevTools does, but not
  // while details are unfolded: a new row would scroll them away mid-read
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const reading = expanded.size > 0;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current && !reading) el.scrollTop = el.scrollHeight;
  }, [visible.length, reading]);

  const loadOlder = (
    <button
      type="button"
      onClick={() => void fetchNextPage()}
      disabled={isFetchingNextPage}
      className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 border-b border-border/60 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-default"
    >
      {isFetchingNextPage && <Loader2 className="size-3.5 animate-spin" />}
      {t('agents.network.loadOlder')}
    </button>
  );

  return (
    <div className="@container/network flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('agents.network.filter')}
            placeholder={t('agents.network.filterPlaceholder')}
            className="h-8 w-full min-w-0 rounded-md border border-input bg-transparent pr-3 pl-8 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>
        <div
          role="group"
          aria-label={t('agents.network.kind')}
          className="flex h-8 shrink-0 items-center rounded-md bg-muted p-0.5"
        >
          {(['all', 'errors'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                'h-7 cursor-pointer rounded-sm px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                kind === value && 'bg-background text-foreground shadow-xs',
              )}
            >
              {t(`agents.network.${value}`)}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
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
        <div className="flex shrink-0 items-center border-b px-3 py-2">
          <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md bg-accent py-0.5 pr-0.5 pl-2 text-xs font-medium text-accent-foreground">
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
              <X className="size-3.5" />
            </button>
          </span>
        </div>
      )}

      {/* A failed poll keeps the rows already shown; only say so inline */}
      {isError && data && (
        <p
          role="status"
          className="shrink-0 border-b bg-destructive/5 px-3 py-1.5 text-xs text-destructive"
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
              'h-9 shrink-0 border-b border-border/60 px-3 text-[11px] font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase',
            )}
          >
            <span />
            <span className={cn('truncate', METHOD_CELL)}>
              {t('agents.network.col.method')}
            </span>
            <span className="truncate">{t('agents.network.col.name')}</span>
            <span className="truncate">{t('agents.network.col.status')}</span>
            <span className="truncate">{t('agents.network.col.size')}</span>
            <span className="truncate">{t('agents.network.col.time')}</span>
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
                    expanded={expanded.has(request.id)}
                    onToggle={toggle}
                    onKeyDown={moveFocus}
                    onShowInChat={onShowInChat}
                  />
                ))}
              </ul>
            )}
          </div>
          <div className="flex h-9 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
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
              <span className="ml-auto shrink-0 text-destructive tabular-nums">
                {t('agents.network.errorCount', { count: `${errorCount}${more}` })}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
