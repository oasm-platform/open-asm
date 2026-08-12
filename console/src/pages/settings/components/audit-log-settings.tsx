import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Download, Eye, FilterX, Loader2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import AccessDenied from '@/components/common/access-denied';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { badgeVariants, type VariantProps } from '@/components/ui/badge-variants';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePermission } from '@/hooks/usePermission';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import useDebounce from '@/hooks/use-debounce';
import { axiosInstance } from '@/services/apis/axios-client';
import {
  auditEventsControllerGetAuditEvents,
  AuditOutcome,
  type AuditEventResponseDto,
  type AuditEventsControllerGetAuditEventsParams,
} from '@/services/apis/gen/queries';
import { AUDIT_EVENT_LABELS, getAuditEventLabel } from '@/constants/audit-events';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

const PAGE_SIZE = 50;

const OUTCOME_VARIANT: Record<AuditOutcome, BadgeVariant> = {
  success: 'success',
  failure: 'destructive',
  denied: 'warning',
};

const OUTCOME_OPTIONS = Object.entries(AuditOutcome).map(([value]) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

const DATE_PRESETS = [
  { value: 'all', label: 'All time' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
] as const;

type DatePreset = (typeof DATE_PRESETS)[number]['value'];

const ACTIONS = Object.entries(AUDIT_EVENT_LABELS).sort((a, b) =>
  a[1].localeCompare(b[1]),
);

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

function isForbiddenError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { response?: { status?: number } }).response?.status === 403
  );
}

function actorDisplayName(event: AuditEventResponseDto): string {
  if (event.actorName) return event.actorName;
  if (event.actorType === 'user') return 'Deleted user';
  return event.actorType.replace(/_/g, ' ');
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <p>Failed to load</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

interface AuditEventSheetProps {
  event: AuditEventResponseDto;
  onClose: () => void;
}

function AuditEventSheet({ event, onClose }: AuditEventSheetProps) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto px-4 pb-4 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{getAuditEventLabel(event.action)}</SheetTitle>
          <SheetDescription>{formatAbsoluteTime(event.occurredAt)}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant={OUTCOME_VARIANT[event.outcome]}>
              {event.outcome.charAt(0).toUpperCase() + event.outcome.slice(1)}
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
              <p className="break-all">{event.userAgent ?? '—'}</p>
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

export default function AuditLogSettings() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { hasPermission, isLoading: permissionLoading } = usePermission();

  const [preset, setPreset] = useState<DatePreset>('all');
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState<string | undefined>(undefined);
  const [action, setAction] = useState<string>('all');
  const [outcome, setOutcome] = useState<AuditOutcome | 'all'>('all');
  const [actorId, setActorId] = useState('');
  const debouncedActorId = useDebounce(actorId, 400);

  const [events, setEvents] = useState<AuditEventResponseDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<AuditEventResponseDto | null>(
    null,
  );

  const buildParams = useCallback(
    (): AuditEventsControllerGetAuditEventsParams => ({
      limit: PAGE_SIZE,
      from: from || undefined,
      to: to || undefined,
      action: action === 'all' ? undefined : action,
      outcome: outcome === 'all' ? undefined : outcome,
      actorId: debouncedActorId.trim() || undefined,
    }),
    [from, to, action, outcome, debouncedActorId],
  );

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    let cancelled = false;
    setEvents([]);
    setNextCursor(null);
    setIsLoading(true);
    setError(null);

    auditEventsControllerGetAuditEvents(selectedWorkspaceId, buildParams())
      .then((res) => {
        if (cancelled) return;
        setEvents(res.data ?? []);
        setNextCursor(res.nextCursor ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedWorkspaceId, buildParams, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!selectedWorkspaceId || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await auditEventsControllerGetAuditEvents(selectedWorkspaceId, {
        ...buildParams(),
        cursor: nextCursor,
      });
      setEvents((prev) => [...prev, ...(res.data ?? [])]);
      setNextCursor(res.nextCursor ?? null);
    } catch (err) {
      toast.error('Failed to load more events', {
        description:
          err instanceof Error ? err.message : 'Please try again',
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [selectedWorkspaceId, nextCursor, isLoadingMore, buildParams]);

  const handlePresetChange = (value: string) => {
    const next = value as DatePreset;
    setPreset(next);
    if (next === 'all') {
      setFrom(undefined);
      setTo(undefined);
      return;
    }
    const hours = next === '24h' ? 24 : next === '7d' ? 24 * 7 : 24 * 30;
    setFrom(new Date(Date.now() - hours * 60 * 60 * 1000).toISOString());
    setTo(new Date().toISOString());
  };

  const handleClearFilters = () => {
    setPreset('all');
    setFrom(undefined);
    setTo(undefined);
    setAction('all');
    setOutcome('all');
    setActorId('');
  };

  const handleExport = async () => {
    if (!selectedWorkspaceId) return;
    const toastId = toast.loading('Exporting data...');
    try {
      // Fresh axios instance (no interceptors) so the blob reaches the browser untouched.
      const downloadAxios = axios.create({
        baseURL: axiosInstance.defaults.baseURL,
        withCredentials: true,
      });
      const res = await downloadAxios.get(
        `/api/workspaces/${selectedWorkspaceId}/audit/export`,
        {
          responseType: 'blob',
          params: buildParams(),
          headers: {
            Accept: 'text/csv,application/vnd.ms-excel,text/plain',
            'X-Workspace-Id': selectedWorkspaceId,
          },
        },
      );
      if (res.status !== 200 || !res.data) {
        throw new Error('Export failed');
      }
      const blob = res.data as Blob;
      if (blob.size === 0) {
        throw new Error('Export returned empty file');
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Export completed successfully!', { id: toastId });
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : 'Please try again',
        id: toastId,
      });
    }
  };

  const columns = useMemo<ColumnDef<AuditEventResponseDto>[]>(
    () => [
      {
        accessorKey: 'occurredAt',
        header: 'When',
        cell: ({ row }) => {
          const occurredAt = row.original.occurredAt;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default whitespace-nowrap">
                  {formatRelativeTime(occurredAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{formatAbsoluteTime(occurredAt)}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'actorName',
        header: 'Actor',
        cell: ({ row }) => {
          const event = row.original;
          const name = actorDisplayName(event);
          return (
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate">{name}</p>
                {event.actorEmail && (
                  <p className="truncate text-xs text-muted-foreground">
                    {event.actorEmail}
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => getAuditEventLabel(row.original.action),
      },
      {
        accessorKey: 'resourceType',
        header: 'Resource',
        cell: ({ row }) => {
          const event = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate">{event.resourceType}</p>
              {event.resourceId && (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {event.resourceId}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'outcome',
        header: 'Outcome',
        cell: ({ row }) => {
          const outcomeValue = row.original.outcome;
          return (
            <Badge variant={OUTCOME_VARIANT[outcomeValue]}>
              {outcomeValue.charAt(0).toUpperCase() + outcomeValue.slice(1)}
            </Badge>
          );
        },
      },
      {
        id: 'details',
        header: '',
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setSelectedEvent(row.original)}
            aria-label="View event details"
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [],
  );

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

  const hasActiveFilters =
    preset !== 'all' || action !== 'all' || outcome !== 'all' || actorId.trim() !== '';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>Date range</Label>
            <Select value={preset} onValueChange={handlePresetChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {ACTIONS.map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(value) => setOutcome(value as AuditOutcome | 'all')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                {OUTCOME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Actor ID</Label>
            <Input
              placeholder="User, API key or agent ID"
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
            >
              <FilterX className="h-4 w-4" />
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleExport}
              disabled={isLoading}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={events}
        isLoading={isLoading}
        page={1}
        pageSize={Math.max(events.length, 5)}
        totalItems={events.length}
        showPagination={false}
        emptyMessage="No audit events found."
        error={
          error ? <LoadError onRetry={() => setReloadKey((k) => k + 1)} /> : undefined
        }
      />

      {nextCursor && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Load more
          </Button>
        </div>
      )}

      {selectedEvent && (
        <AuditEventSheet
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
