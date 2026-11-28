import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
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
} from '@/services/apis/gen/queries';
import CreateWorkspace from '../workspaces/create-workspace';
import { NewReportDialog } from './new-report-dialog';
import { NewReportMenu } from './new-report-menu';
import { buildReportColumns } from './report-columns';
import { TEMPLATE_META, type ReportDraft } from './report-meta';
import { ReportPreviewSheet } from './report-preview-sheet';
import { ReportSchedules, reportSchedulesKey } from './report-schedules';

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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
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
    query: { queryKey: ['reports', selectedWorkspaceId, 'count', countType ?? 'all'] },
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

  const deleteMutation = useReportsControllerDeleteReport({
    mutation: {
      onSuccess: (_, { id }) => {
        toast.success(t('reports.toast.deleted'));
        if (previewed?.id === id) setPreviewed(null);
        refreshReports();
      },
      onError: () => toast.error(t('reports.toast.deleteFailed')),
    },
  });

  // The list carries no URLs; one is signed only for the report being downloaded.
  const handleDownload = async (report: ReportResponseDto) => {
    setDownloadingId(report.id);
    try {
      const { url } = await reportsControllerGetDownloadUrl(report.id);
      // The URL forces `Content-Disposition: attachment`, so the page stays put.
      window.location.assign(url);
    } catch (error) {
      handleServerError(error);
    } finally {
      setDownloadingId(null);
    }
  };

  const openDialog = (draft?: Partial<ReportDraft>) =>
    setDialog((prev) => ({ key: (prev?.key ?? 0) + 1, draft }));

  const columns = buildReportColumns(t, {
    onPreview: setPreviewed,
    onDownload: (report) => void handleDownload(report),
    onDelete: (report) => deleteMutation.mutate({ id: report.id }),
    downloadingId,
    isDeleting: deleteMutation.isPending,
  });

  if (wsLoading) return null;

  const hasWorkspace = workspaces.length > 0;

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

          <DataTable
            data={data?.data ?? []}
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
            rowClassName="group/row cursor-pointer"
          />
        </div>
      )}

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
        onDelete={(report) => deleteMutation.mutate({ id: report.id })}
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
