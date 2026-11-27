import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { dateFnsLocale } from '@/lib/date-locale';
import { useT } from '@/lib/i18n-dictionary';
import { stripPageContextFromTitle } from '@/lib/page-context';
import {
  agentHttpRequestsControllerGetHttpRequests,
  type AgentHttpRequestListItemDto,
  type AgentHttpRequestsControllerGetHttpRequestsParams,
} from '@/services/apis/gen/queries';
import { formatBytes } from '@/utils/format-bytes';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { format, formatDistanceToNow } from 'date-fns';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HttpRequestDetail } from './components/http-request-detail';
import {
  displayMethod,
  formatDuration,
  outcomeVariant,
  requestUrl,
  statusVariant,
} from './format';

export interface HttpRequestsSearch {
  conversationId?: string;
  host?: string;
  errorsOnly?: boolean;
}

const PAGE_SIZE = 50;
const POLL_MS = 10_000;
const HOST_DEBOUNCE_MS = 300;

function SkeletonRows() {
  return Array.from({ length: 6 }, (_, i) => (
    <TableRow key={i}>
      {Array.from({ length: 8 }, (_, j) => (
        <TableCell key={j}>
          <Skeleton className="h-4 w-full min-w-10" />
        </TableCell>
      ))}
    </TableRow>
  ));
}

function RequestRow({
  request,
  onOpen,
}: {
  request: AgentHttpRequestListItemDto;
  onOpen: () => void;
}) {
  const t = useT();
  const sentAt = new Date(request.sentAt);
  const url = requestUrl(request);

  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell
        className="text-xs text-muted-foreground tabular-nums"
        title={formatDistanceToNow(sentAt, {
          addSuffix: true,
          locale: dateFnsLocale(),
        })}
      >
        {format(sentAt, 'MMM d, HH:mm:ss', { locale: dateFnsLocale() })}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono">
          {displayMethod(request.method)}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[24rem]">
        {/* The row is clickable too; this button gives keyboard users the same action */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="block max-w-full cursor-pointer truncate rounded-sm text-left font-mono text-xs hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {url}
        </button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {request.statusCode === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <Badge variant={statusVariant(request.statusCode)}>
              {request.statusCode}
            </Badge>
          )}
          {request.outcome !== 'allowed' && (
            <Badge
              variant={outcomeVariant(request.outcome)}
              title={request.error ?? undefined}
            >
              {t(`agents.httpRequests.outcome.${request.outcome}`)}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatDuration(request.durationMs)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatBytes(request.responseBytes)}
      </TableCell>
      <TableCell className="max-w-[14rem]">
        <Link
          to="/aistudio/conversations/$conversationId"
          params={{ conversationId: request.conversationId }}
          onClick={(e) => e.stopPropagation()}
          className="block truncate hover:underline"
        >
          {stripPageContextFromTitle(request.conversationTitle ?? '') ||
            t('agents.conversations.newConversation')}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{request.agentName}</TableCell>
    </TableRow>
  );
}

/**
 * HTTP requests the current user's agent shell commands made through the
 * worker egress proxy, newest first. Filters live in the URL so a
 * conversation can link here already filtered.
 */
export default function AgentHttpRequestsPage({
  search,
  onSearchChange,
}: {
  search: HttpRequestsSearch;
  onSearchChange: (next: HttpRequestsSearch) => void;
}) {
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hostDraft, setHostDraft] = useState(search.host ?? '');

  // The latest search, so a debounced host change never restores stale filters
  const searchRef = useRef(search);
  const hostTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);
  useEffect(() => () => clearTimeout(hostTimer.current), []);

  const changeHost = (value: string) => {
    setHostDraft(value);
    clearTimeout(hostTimer.current);
    hostTimer.current = setTimeout(() => {
      onSearchChange({ ...searchRef.current, host: value.trim() || undefined });
    }, HOST_DEBOUNCE_MS);
  };

  const params: AgentHttpRequestsControllerGetHttpRequestsParams = {
    conversationId: search.conversationId,
    host: search.host,
    errorsOnly: search.errorsOnly,
    limit: PAGE_SIZE,
  };

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['/api/agents/http-requests', 'infinite', selectedWorkspaceId, params],
    queryFn: ({ pageParam, signal }) =>
      agentHttpRequestsControllerGetHttpRequests(
        { ...params, cursor: pageParam },
        undefined,
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!selectedWorkspaceId,
    // No push channel for new rows; a hidden tab stops polling
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });

  const requests = data?.pages.flatMap((page) => page.data) ?? [];
  const filtered = !!(search.conversationId || search.host || search.errorsOnly);
  const conversationTitle = search.conversationId
    ? stripPageContextFromTitle(
        requests.find((r) => r.conversationId === search.conversationId)
          ?.conversationTitle ?? '',
      ) || search.conversationId.slice(0, 8)
    : null;

  return (
    <Page
      title={t('agents.httpRequests.title')}
      description={t('agents.httpRequests.description')}
      // max-md:pt-10 clears the sidebar trigger floating at the top-left
      className="mx-auto w-full max-w-6xl max-md:pt-10"
      permission="agent.read"
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isRefetching}
        >
          <RefreshCw className={isRefetching ? 'animate-spin' : undefined} />
          {t('agents.httpRequests.refresh')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label={t('agents.httpRequests.hostFilter')}
            placeholder={t('agents.httpRequests.hostPlaceholder')}
            value={hostDraft}
            onChange={(e) => changeHost(e.target.value)}
            className="h-8 w-64"
          />
          <div className="flex items-center gap-2">
            <Switch
              id="http-requests-errors-only"
              checked={!!search.errorsOnly}
              onCheckedChange={(checked) =>
                onSearchChange({ ...search, errorsOnly: checked || undefined })
              }
            />
            <Label htmlFor="http-requests-errors-only" className="text-sm">
              {t('agents.httpRequests.errorsOnly')}
            </Label>
          </div>
          {conversationTitle && (
            <Badge variant="soft" className="gap-1 pr-1">
              <span className="max-w-56 truncate">
                {t('agents.httpRequests.conversationFilter', {
                  title: conversationTitle,
                })}
              </span>
              <button
                type="button"
                aria-label={t('agents.httpRequests.clearConversation')}
                onClick={() =>
                  onSearchChange({ ...search, conversationId: undefined })
                }
                className="cursor-pointer rounded-sm p-0.5 hover:bg-background/60"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
        </div>

        {isError ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('agents.httpRequests.loadFailed')}
            </p>
          </div>
        ) : !isLoading && requests.length === 0 ? (
          <div className="space-y-1 rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm font-medium">
              {filtered
                ? t('agents.httpRequests.emptyFiltered')
                : t('agents.httpRequests.empty')}
            </p>
            <p className="mx-auto max-w-xl text-xs text-muted-foreground">
              {t('agents.httpRequests.emptyHint')}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('agents.httpRequests.time')}</TableHead>
                  <TableHead>{t('agents.httpRequests.method')}</TableHead>
                  <TableHead>{t('agents.httpRequests.url')}</TableHead>
                  <TableHead>{t('agents.httpRequests.status')}</TableHead>
                  <TableHead className="text-right">
                    {t('agents.httpRequests.duration')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('agents.httpRequests.size')}
                  </TableHead>
                  <TableHead>{t('agents.httpRequests.conversation')}</TableHead>
                  <TableHead>{t('agents.httpRequests.agent')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <SkeletonRows />
                ) : (
                  requests.map((request) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      onOpen={() => setSelectedId(request.id)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            className="self-center"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <Loader2 className="animate-spin" />
            ) : (
              t('agents.httpRequests.loadMore')
            )}
          </Button>
        )}
      </div>

      <HttpRequestDetail
        requestId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </Page>
  );
}
