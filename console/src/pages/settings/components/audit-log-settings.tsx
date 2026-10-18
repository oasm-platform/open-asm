import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Bot,
  Download,
  KeyRound,
  Lightbulb,
  Loader2,
  Server,
} from 'lucide-react';
import { endOfDay, startOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import AccessDenied from '@/components/common/access-denied';
import { isGroup, type Filter } from '@/components/filter-builder/filter-model';
import { FilterToolbar } from '@/components/filter-builder/filter-toolbar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { badgeVariants, type VariantProps } from '@/components/ui/badge-variants';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DatePickerWithRange } from '@/components/ui/date-picker-range';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePermission } from '@/hooks/usePermission';
import {
  useWorkspaceSelector,
  useWorkspaceState,
} from '@/hooks/useWorkspaceSelector';
import {
  auditEventsControllerGetAuditEvents,
  useAuditEventsControllerGetAuditActions,
  type AuditOutcome,
  type AuditEventResponseDto,
  type AuditEventsControllerGetAuditEventsParams,
} from '@/services/apis/gen/queries';
import { axiosInstance } from '@/services/apis/axios-client';
import { AUDIT_FILTER_FIELDS, auditFilterParams } from '../audit-filter-fields';
import { parseUserAgent } from '../user-agent';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

const PAGE_SIZE = 50;

const OUTCOME_VARIANT: Record<AuditOutcome, BadgeVariant> = {
  success: 'success',
  failure: 'destructive',
  denied: 'warning',
};

function formatRelativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isForbiddenError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { response?: { status?: number } }).response?.status === 403
  );
}

/**
 * The export endpoint streams a CSV (responseType 'blob'), so a non-2xx error
 * body arrives as a Blob too — e.g. the 400 "export capped at 10,000 rows"
 * rejection. Read the Blob and surface the backend's message when possible.
 */
async function extractExportErrorMessage(err: unknown): Promise<string> {
  const responseData = (err as { response?: { data?: unknown } })?.response
    ?.data;
  if (responseData instanceof Blob) {
    try {
      const text = await responseData.text();
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === 'string') return parsed.message;
      return text;
    } catch {
      // Not JSON — fall through to the generic message.
    }
  }
  return err instanceof Error ? err.message : 'Please try again';
}

/**
 * Fetch the audit CSV as a Blob. Deliberately does NOT use the orval-generated
 * auditEventsControllerExportAuditEvents hook: core-api regenerates
 * .open-api/open-api.json from its live swagger on every boot (main.ts), and
 * the export controller carries no response @Doc — so a fresh spec types the
 * hook as void/unknown and a regen would silently break the download. This
 * wrapper pins the request (GET + responseType blob, same shape as the
 * generated storage-download hook) and always yields real CSV bytes.
 */
async function fetchAuditExportBlob(
  workspaceId: string,
  params?: AuditEventsControllerGetAuditEventsParams,
): Promise<Blob> {
  // axiosInstance's response interceptor resolves to response.data (the Blob),
  // not an AxiosResponse wrapper.
  return axiosInstance.get(
    `/api/workspaces/${workspaceId}/audit/export`,
    { params, responseType: 'blob' },
  ) as unknown as Promise<Blob>;
}

function actorDisplayName(event: AuditEventResponseDto): string {
  if (event.actorName) return event.actorName;
  if (event.actorType === 'user') return 'Deleted user';
  return event.actorType.replace(/_/g, ' ');
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-sm">
      <p>Failed to load</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

const ACTOR_ICON = { api_key: KeyRound, system: Server, agent: Bot } as const;

function ActorAvatar({ event }: { event: AuditEventResponseDto }) {
  const Icon =
    event.actorType === 'user' ? null : ACTOR_ICON[event.actorType];
  return (
    <Avatar className="mt-0.5 size-8 shrink-0">
      <AvatarFallback className="text-xs">
        {Icon ? (
          <Icon className="size-4" />
        ) : (
          actorDisplayName(event).slice(0, 2).toUpperCase()
        )}
      </AvatarFallback>
    </Avatar>
  );
}

function UserAgentDetails({ userAgent }: { userAgent: string }) {
  const ua = parseUserAgent(userAgent);
  const rows: Array<[string, string | undefined]> = [
    [ua.isBrowser ? 'Browser' : 'Client', ua.client],
    ['Operating system', ua.os],
    ['Device type', ua.deviceType],
    ['Device', ua.device],
  ];
  return (
    <div className="mt-1 space-y-2 rounded-md border bg-muted/30 px-3 py-2">
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value ?? 'Unknown'}</dd>
          </div>
        ))}
      </dl>
      <p className="break-all font-mono text-xs text-muted-foreground">
        {userAgent}
      </p>
    </div>
  );
}

interface AuditEventSheetProps {
  event: AuditEventResponseDto;
  label: string;
  onClose: () => void;
}

function AuditEventSheet({ event, label, onClose }: AuditEventSheetProps) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto px-4 pb-4 sm:max-w-lg">
        {/* SheetHeader defaults to p-4; SheetContent already carries px-4, so
            zero the header's own horizontal/bottom padding to keep the title
            edge-aligned with the body content. */}
        <SheetHeader className="px-0 pt-4 pb-0">
          <SheetTitle>{label}</SheetTitle>
          <SheetDescription>{formatAbsoluteTime(event.occurredAt)}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant={OUTCOME_VARIANT[event.outcome]}>
              {capitalize(event.outcome)}
            </Badge>
            <span className="text-sm text-muted-foreground">{event.action}</span>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Actor</p>
              <p>
                {actorDisplayName(event)}
                {event.actorEmail ? (
                  <span className="text-muted-foreground"> ({event.actorEmail})</span>
                ) : null}
                {event.actorId ? (
                  <span className="ml-1 font-mono text-xs text-muted-foreground">
                    {event.actorId}
                  </span>
                ) : null}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Resource</p>
              <p>
                {event.resourceType}
                {event.resourceId ? (
                  <span className="ml-1 font-mono text-xs text-muted-foreground">
                    {event.resourceId}
                  </span>
                ) : null}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Source IP</p>
              <p className="font-mono">{event.sourceIp ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">User agent</p>
              {event.userAgent ? (
                <UserAgentDetails userAgent={event.userAgent} />
              ) : (
                <p>—</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Request ID</p>
              <p className="font-mono">{event.requestId ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Correlation ID</p>
              <p className="font-mono">{event.correlationId ?? '—'}</p>
            </div>
          </div>

          {Object.keys(event.changes).length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Changes</p>
              <div className="space-y-2">
                {Object.entries(event.changes).map(([key, change]) => {
                  const diff =
                    typeof change === 'object' && change !== null
                      ? (change as { before?: unknown; after?: unknown })
                      : null;
                  const before = diff?.before;
                  const after = diff?.after;
                  return (
                    <div
                      key={key}
                      className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <p className="font-medium">{key}</p>
                      <p className="mt-0.5 text-muted-foreground">
                        <span className="line-through decoration-destructive/60">
                          {formatValue(before)}
                        </span>
                        <span className="mx-1.5 text-muted-foreground">→</span>
                        <span className="text-foreground">{formatValue(after)}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(event.metadata).length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Metadata</p>
              <div className="space-y-1.5">
                {Object.entries(event.metadata).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="text-muted-foreground">{key}: </span>
                    <span className="break-all">{formatValue(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRaw((prev) => !prev)}
            >
              {showRaw ? 'Hide raw JSON' : 'View raw JSON'}
            </Button>
            {showRaw && (
              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(event, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EventSkeleton() {
  return (
    <li className="flex gap-3 px-4 py-3">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </li>
  );
}

export default function AuditLogSettings() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { hasPermission, isLoading: permissionLoading } = usePermission();
  const { workspaces } = useWorkspaceSelector();

  const [filter, setFilter] = useState<Filter | undefined>(undefined);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const [events, setEvents] = useState<AuditEventResponseDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<AuditEventResponseDto | null>(
    null,
  );
  const [isExporting, setIsExporting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Newer/Older paging over the forward-only keyset cursor: a stack of the
  // cursors that opened each visited page. It belongs to one workspace +
  // filter + date scope, so a scope change falls back to the first page
  // without a reset effect (and the double fetch one would cause).
  const scopeKey = JSON.stringify([selectedWorkspaceId, filter, dateRange]);
  const [pager, setPager] = useState<{
    scopeKey: string;
    cursors: (string | undefined)[];
  }>({ scopeKey, cursors: [undefined] });
  const cursors = pager.scopeKey === scopeKey ? pager.cursors : [undefined];
  const cursor = cursors[cursors.length - 1];

  // Action catalog from the backend (GET /workspaces/:id/audit/actions):
  // the source of truth for row labels (the filter's Action field reads it too).
  // ponytail: fallback humanizes unknown actions instead of blocking render.
  const { data: actionCatalog } = useAuditEventsControllerGetAuditActions(
    selectedWorkspaceId,
    { query: { enabled: !!selectedWorkspaceId } },
  );

  const actionLabelMap = useMemo(
    () =>
      new Map(
        (actionCatalog?.data ?? []).map((entry) => [entry.action, entry.label]),
      ),
    [actionCatalog],
  );

  const getActionLabel = useCallback(
    (action: string): string =>
      actionLabelMap.get(action) ?? action.replace(/\./g, ' '),
    [actionLabelMap],
  );

  const buildParams = useCallback(
    (): AuditEventsControllerGetAuditEventsParams => ({
      limit: PAGE_SIZE,
      ...auditFilterParams(filter),
      from: dateRange?.from ? startOfDay(dateRange.from).toISOString() : undefined,
      to: dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined,
    }),
    [filter, dateRange],
  );

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    auditEventsControllerGetAuditEvents(
      selectedWorkspaceId,
      { ...buildParams(), cursor },
      undefined,
      controller.signal,
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        setEvents(res.data ?? []);
        setNextCursor(res.nextCursor ?? null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [selectedWorkspaceId, buildParams, cursor, reloadKey]);

  const goToPage = (next: (string | undefined)[]) => {
    setPager({ scopeKey, cursors: next });
    listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  /** Clicking an actor or action narrows the filter to it (replacing that field's condition). */
  const filterBy = (field: 'actorId' | 'action', value: string) => {
    setFilter((prev) => ({
      logic: 'and',
      items: [
        ...(prev?.items ?? []).filter((i) => isGroup(i) || i.field !== field),
        { field, op: 'eq', value },
      ],
    }));
  };

  const handleExport = async () => {
    if (!selectedWorkspaceId || isExporting) return;
    setIsExporting(true);
    try {
      const blob = await fetchAuditExportBlob(selectedWorkspaceId, buildParams());
      const csvText = await blob.text();
      const rowCount = Math.max(
        csvText.split('\n').filter((line) => line.trim() !== '').length - 1,
        0,
      );

      const workspaceName = workspaces.find(
        (ws) => ws.id === selectedWorkspaceId,
      )?.name;
      const safeName = (workspaceName || selectedWorkspaceId).replace(
        /[^a-zA-Z0-9_-]+/g,
        '-',
      );
      const filename = `audit-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(
        rowCount === 1 ? 'Exported 1 event' : `Exported ${rowCount} events`,
      );
    } catch (err) {
      toast.error('Export failed', {
        description: await extractExportErrorMessage(err),
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!selectedWorkspaceId) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-center text-muted-foreground">
            No workspace selected. Select a workspace to view its audit log.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (permissionLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!hasPermission('audit.read')) {
    return <AccessDenied />;
  }

  if (isForbiddenError(error)) {
    return <AccessDenied />;
  }

  const renderEvent = (event: AuditEventResponseDto) => {
    const name = actorDisplayName(event);
    // The actor/action links filter instead of opening the sheet.
    const filterClick =
      (field: 'actorId' | 'action', value: string) =>
      (e: React.MouseEvent) => {
        e.stopPropagation();
        filterBy(field, value);
      };
    return (
      <li
        key={event.id}
        tabIndex={0}
        className="flex cursor-pointer gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
        onClick={() => setSelectedEvent(event)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setSelectedEvent(event);
          }
        }}
      >
        <ActorAvatar event={event} />
        <div className="min-w-0 flex-1 space-y-0.5 text-sm">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {event.actorId ? (
              <button
                type="button"
                className="font-semibold hover:underline"
                title="Filter by this actor"
                onClick={filterClick('actorId', event.actorId)}
              >
                {name}
              </button>
            ) : (
              <span className="font-semibold capitalize">{name}</span>
            )}
            <span className="text-muted-foreground">–</span>
            <button
              type="button"
              className="break-all text-left font-medium text-primary hover:underline"
              title="Filter by this action"
              onClick={filterClick('action', event.action)}
            >
              {event.action}
            </button>
            {event.outcome !== 'success' && (
              <Badge variant={OUTCOME_VARIANT[event.outcome]}>
                {capitalize(event.outcome)}
              </Badge>
            )}
          </p>
          <p className="break-words">
            {getActionLabel(event.action)}
            <span className="text-muted-foreground"> · {event.resourceType}</span>
            {event.resourceId && (
              <span className="ml-1 break-all font-mono text-xs text-muted-foreground">
                {event.resourceId}
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{event.sourceIp ?? 'Unknown source'}</span>
            <span aria-hidden className="h-3 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="whitespace-nowrap">
                  {formatRelativeTime(event.occurredAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{formatAbsoluteTime(event.occurredAt)}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex w-full flex-col gap-2 md:flex-row md:items-center">
        <FilterToolbar
          fields={AUDIT_FILTER_FIELDS}
          value={filter}
          onApply={setFilter}
          flat
        />
        <DatePickerWithRange
          label="Date"
          value={dateRange}
          onChange={setDateRange}
          className="w-full md:w-60"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {isExporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>

      <div ref={listRef} className="scroll-mt-4 overflow-hidden rounded-md border">
        <div className="border-b bg-muted/40 px-4 py-3 text-sm font-semibold">
          Recent events
        </div>
        {error ? (
          <div className="py-10">
            <LoadError onRetry={() => setReloadKey((k) => k + 1)} />
          </div>
        ) : isLoading ? (
          <ul className="divide-y" aria-busy>
            {Array.from({ length: 5 }, (_, i) => (
              <EventSkeleton key={i} />
            ))}
          </ul>
        ) : events.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No audit events found.
          </p>
        ) : (
          <ul className="divide-y">{events.map(renderEvent)}</ul>
        )}
      </div>

      <div className="flex items-center justify-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={cursors.length === 1 || isLoading}
          onClick={() => goToPage(cursors.slice(0, -1))}
        >
          Newer
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!nextCursor || isLoading}
          onClick={() => nextCursor && goToPage([...cursors, nextCursor])}
        >
          Older
        </Button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lightbulb className="size-3.5 shrink-0" />
        <span>
          <span className="font-semibold">Tip:</span> click an actor or action to
          filter by it.
        </span>
      </p>

      {selectedEvent && (
        <AuditEventSheet
          event={selectedEvent}
          label={getActionLabel(selectedEvent.action)}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
