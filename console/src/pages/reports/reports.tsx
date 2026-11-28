import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, useQueryTab } from '@/components/ui/tabs';
import { useLiveEvents } from '@/hooks/use-live-events';
import { usePermission } from '@/hooks/usePermission';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceSelector, useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { getLocalTimezone, getNextRun } from '@/lib/cron-schedule';
import { formatDate, fromNow } from '@/lib/date-locale';
import { handleServerError } from '@/lib/handle-server-error';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import type { ReportResponseDto } from '@/services/apis/gen/queries';
import {
  reportsControllerGetDownloadUrl,
  useReportsControllerDeleteReport,
  useReportsControllerGetMany,
  useReportsControllerListSchedules,
  useWorkspacesControllerGetWorkspaceMembers,
} from '@/services/apis/gen/queries';
import CreateWorkspace from '../workspaces/create-workspace';
import { NewReportDialog } from './new-report-dialog';
import { NewReportMenu } from './new-report-menu';
import { settlePendingReports, usePendingReports } from './pending-reports';
import { PendingReportsList } from './pending-reports-list';
import { buildReportColumns } from './report-columns';
import { reportCountKey, TEMPLATE_META, templateOf, type ReportDraft } from './report-meta';
import { ReportPreviewSheet } from './report-preview-sheet';
import { ReportSchedules, reportSchedulesKey } from './report-schedules';
import { ReportsEmptyState } from './reports-empty-state';

type TypeFilter = 'all' | 'SUMMARY' | 'VULNERABILITY';

const TYPE_FILTERS: { value: TypeFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'reports.tabs.all' },
  { value: 'SUMMARY', labelKey: 'reports.tabs.summary' },
  { value: 'VULNERABILITY', labelKey: 'reports.tabs.vulnerability' },
];

export default function Reports() {
  const t = useT();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ key: number; draft?: Partial<ReportDraft> } | null>(null);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [previewed, setPreviewed] = useState<ReportResponseDto | null>(null);
  const [typeFilter, setTypeFilter] = useQueryTab({
    tabParam: 'tab',
    defaultValue: 'all',
    validValues: TYPE_FILTERS.map((f) => f.value),
  });

  const { workspaces, isLoading: wsLoading } = useWorkspaceSelector();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setFilter, setParams },
  } = useServerDataTable();

  const type = typeFilter === 'all' ? undefined : (typeFilter as Exclude<TypeFilter, 'all'>);
  const { data, isLoading, refetch } = useReportsControllerGetMany(
    { limit: pageSize, page, sortBy, sortOrder, search: filter, type },
    {
      query: {
        queryKey: ['reports', selectedWorkspaceId, pageSize, page, sortBy, sortOrder, filter, type],
      },
    },
  );

  // One-row pages, only for the totals shown on the type filter.
  const countQuery = (countType?: Exclude<TypeFilter, 'all'>) => ({
    query: { queryKey: reportCountKey(selectedWorkspaceId, countType) },
  });
  const allCount = useReportsControllerGetMany({ limit: 1 }, countQuery());
  const summaryCount = useReportsControllerGetMany({ limit: 1, type: 'SUMMARY' }, countQuery('SUMMARY'));
  const vulnCount = useReportsControllerGetMany(
    { limit: 1, type: 'VULNERABILITY' },
    countQuery('VULNERABILITY'),
  );
  const counts: Record<TypeFilter, number | undefined> = {
    all: allCount.data?.total,
    SUMMARY: summaryCount.data?.total,
    VULNERABILITY: vulnCount.data?.total,
  };

  const { data: schedules } = useReportsControllerListSchedules({
    query: { queryKey: reportSchedulesKey(selectedWorkspaceId) },
  });
  const nextRun = useMemo(() => {
    const timezone = getLocalTimezone();
    return (schedules ?? [])
      .map((schedule) => ({ schedule, at: getNextRun(schedule.cron, timezone) }))
      .filter((run): run is { schedule: typeof run.schedule; at: Date } => run.at !== null)
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  }, [schedules]);

  const refreshReports = () => void queryClient.invalidateQueries({ queryKey: ['reports'] });

  // A queued report shows up when its "ready" notification arrives.
  useLiveEvents('notification.*', refreshReports);

  const pendingReports = usePendingReports(selectedWorkspaceId);
  const allTotal = allCount.data?.total;
  useEffect(() => {
    if (!selectedWorkspaceId || allTotal === undefined) return;
    settlePendingReports(selectedWorkspaceId, allTotal);
    // A failed run never grows the list, so expire its entry without waiting for one.
    const timer = window.setInterval(
      () => settlePendingReports(selectedWorkspaceId, allTotal),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, [selectedWorkspaceId, allTotal]);

  // Names of who generated each report; listing members needs `member.read`.
  const { hasPermission } = usePermission();
  const canListMembers = hasPermission('member.read');
  const { data: members } = useWorkspacesControllerGetWorkspaceMembers({
    query: { enabled: canListMembers },
  });
  const creators = useMemo(
    () =>
      canListMembers && members
        ? new Map(members.flatMap((m) => (m.user ? [[m.user.id, m.user.name] as const] : [])))
        : undefined,
    [canListMembers, members],
  );

  const reports = useMemo(() => data?.data ?? [], [data?.data]);
  // Selection is kept by report id: the table speaks row indexes, and a report
  // landing on top of the list would otherwise shift every tick onto another
  // report. It also belongs to the page it was made on: any change of page,
  // sort, search or type starts from an empty selection.
  const selectionScope = [page, pageSize, sortBy, sortOrder, filter, type].join('|');
  const [selection, setSelection] = useState({ scope: '', ids: [] as string[] });
  const selectedIds = selection.scope === selectionScope ? selection.ids : [];
  const selected = reports.filter((report) => selectedIds.includes(report.id));
  const rowSelection = Object.fromEntries(
    reports.flatMap((report, index) => (selectedIds.includes(report.id) ? [[String(index), true]] : [])),
  );
  const setRowSelection = (rows: Record<string, boolean>) =>
    setSelection({
      scope: selectionScope,
      ids: reports.filter((_, index) => rows[String(index)]).map((report) => report.id),
    });
  const [toDelete, setToDelete] = useState<ReportResponseDto[] | null>(null);

  const deleteMutation = useReportsControllerDeleteReport();
  const deleteReports = async (targets: ReportResponseDto[]) => {
    const results = await Promise.allSettled(
      targets.map((report) => deleteMutation.mutateAsync({ id: report.id })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const deleted = targets.length - failed;
    if (deleted > 0) {
      toast.success(
        targets.length === 1
          ? t('reports.toast.deleted')
          : t('reports.toast.deletedMany', { count: deleted }),
      );
    }
    if (failed > 0) toast.error(t('reports.toast.deleteFailed'));
    if (previewed && targets.some((report) => report.id === previewed.id)) setPreviewed(null);
    setRowSelection({});
    refreshReports();
  };

  // The list carries no URLs; one is signed only for the report being downloaded.
  const handleDownload = async (report: ReportResponseDto) => {
    try {
      const { url } = await reportsControllerGetDownloadUrl(report.id);
      // The URL forces `Content-Disposition: attachment`, so the page stays put.
      window.location.assign(url);
    } catch (error) {
      handleServerError(error);
    }
  };

  const openDialog = (draft?: Partial<ReportDraft>) =>
    setDialog((prev) => ({ key: (prev?.key ?? 0) + 1, draft }));

  const columns = buildReportColumns(t, {
    onPreview: setPreviewed,
    onDownload: (report) => void handleDownload(report),
    // Reports keep no options, so "again" starts from the same template only.
    onRerun: (report) => openDialog({ template: templateOf(report.type) }),
    onDelete: (report) => setToDelete([report]),
    creators,
  });

  if (wsLoading) return null;

  const hasWorkspace = workspaces.length > 0;
  const isFirstRun = allTotal === 0 && pendingReports.length === 0;

  return (
    <Page
      title={t('reports.page.title')}
      description={t('reports.page.description')}
      permission="report.read"
      action={
        hasWorkspace ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setSchedulesOpen(true)}>
              {t('reports.actions.schedules')}
              {schedules && schedules.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {schedules.length}
                </span>
              )}
            </Button>
            <NewReportMenu onCustomize={() => openDialog()} />
          </div>
        ) : null
      }
    >
      {!hasWorkspace ? (
        <CreateWorkspace />
      ) : !data && !isLoading ? (
        <DataTableError message={t('reports.loadFailed')} onRetry={refetch} />
      ) : isFirstRun ? (
        <ReportsEmptyState onStart={openDialog} />
      ) : (
        <div className="flex flex-col gap-4">
          {nextRun && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
              <span
                className={cn('size-2 shrink-0 rounded-full', TEMPLATE_META[nextRun.schedule.type].dot)}
              />
              <span>
                <span className="font-medium">{t('reports.nextRun.label')}</span>{' '}
                {t(TEMPLATE_META[nextRun.schedule.type].labelKey)} ·{' '}
                <span title={formatDate(nextRun.at, 'PPpp')}>{fromNow(nextRun.at)}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7"
                onClick={() => setSchedulesOpen(true)}
              >
                {t('reports.nextRun.manage')}
              </Button>
            </div>
          )}

          <Tabs
            value={typeFilter}
            onValueChange={(value) => {
              setTypeFilter(value);
              setPage(1);
            }}
          >
            <TabsList>
              {TYPE_FILTERS.map((option) => (
                <TabsTrigger key={option.value} value={option.value} badge={counts[option.value]}>
                  {t(option.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <PendingReportsList reports={pendingReports} />

          <DataTable
            data={reports}
            columns={columns}
            isLoading={isLoading}
            page={page}
            pageSize={pageSize}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onSortChange={(col, order) => setParams({ sortBy: col, sortOrder: order })}
            filterColumnKey="fileName"
            filterValue={filter}
            onFilterChange={setFilter}
            filterPlaceholder={t('reports.searchPlaceholder')}
            totalItems={data?.total ?? 0}
            emptyMessage={t('reports.empty')}
            onRowClick={setPreviewed}
            rowClassName="cursor-pointer"
            showCheckBox
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            selectionHeader={(count) => (
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium">{t('reports.selection.count', { count })}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-destructive hover:text-destructive"
                  onClick={() => setToDelete(selected)}
                >
                  {t('common.delete')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-muted-foreground"
                  onClick={() => setRowSelection({})}
                >
                  {t('reports.selection.clear')}
                </Button>
              </div>
            )}
          />
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('reports.delete.title')}
        description={
          toDelete?.length === 1
            ? t('reports.delete.description', { name: toDelete[0].fileName })
            : t('reports.delete.descriptionMany', { count: toDelete?.length ?? 0 })
        }
        confirmText={t('common.delete')}
        disabled={deleteMutation.isPending}
        onConfirm={() => toDelete && void deleteReports(toDelete)}
      />

      {dialog && (
        <NewReportDialog
          key={dialog.key}
          open
          initialDraft={dialog.draft}
          onOpenChange={(open) => !open && setDialog(null)}
        />
      )}

      <ReportPreviewSheet
        report={previewed}
        onOpenChange={(open) => !open && setPreviewed(null)}
        onDownload={(report) => void handleDownload(report)}
        onDelete={(report) => void deleteReports([report])}
        isDeleting={deleteMutation.isPending}
      />

      <Sheet open={schedulesOpen} onOpenChange={setSchedulesOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{t('reports.schedules.title')}</SheetTitle>
            <SheetDescription>{t('reports.schedules.description')}</SheetDescription>
            <div className="pt-2">
              <Button
                size="sm"
                onClick={() => {
                  setSchedulesOpen(false);
                  openDialog({ repeat: true });
                }}
              >
                {t('reports.schedules.add')}
              </Button>
            </div>
          </SheetHeader>
          <div className="overflow-y-auto p-4">
            <ReportSchedules workspaceId={selectedWorkspaceId} />
          </div>
        </SheetContent>
      </Sheet>
    </Page>
  );
}
