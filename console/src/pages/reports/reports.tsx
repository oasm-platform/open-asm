import type { ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Download, FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { toast } from 'sonner';

import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { DatePickerWithRange } from '@/components/ui/date-picker-range';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useWorkspaceSelector,
  useWorkspaceState,
} from '@/hooks/useWorkspaceSelector';
import type { ReportResponseDto } from '@/services/apis/gen/queries';
import {
  useReportsControllerDeleteReport,
  useReportsControllerGenerateSummaryReport,
  useReportsControllerGenerateVulReport,
  useReportsControllerGetMany,
} from '@/services/apis/gen/queries';
import CreateWorkspace from '../workspaces/create-workspace';

dayjs.extend(relativeTime);

type TabValue = 'all' | 'SUMMARY' | 'VULNERABILITY' | 'templates';

const SEVERITY_OPTIONS = [
  { value: 'CRITICAL', label: 'Critical', color: 'text-red-500' },
  { value: 'HIGH', label: 'High', color: 'text-orange-500' },
  { value: 'MEDIUM', label: 'Medium', color: 'text-yellow-600' },
  { value: 'LOW', label: 'Low', color: 'text-blue-500' },
  { value: 'INFO', label: 'Info', color: 'text-gray-500' },
] as const;

type ReportType = 'SUMMARY' | 'VULNERABILITY';

export default function Reports() {
  const [generateOpen, setGenerateOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('SUMMARY');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [minSeverity, setMinSeverity] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabValue>('all');

  const { workspaces, isLoading: wsLoading } = useWorkspaceSelector();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setFilter, setParams },
  } = useServerDataTable();

  const { data, isLoading, refetch } = useReportsControllerGetMany(
    {
      limit: pageSize,
      page,
      sortBy,
      sortOrder,
      search: filter,
      type:
        activeTab === 'SUMMARY' || activeTab === 'VULNERABILITY'
          ? activeTab
          : undefined,
    },
    {
      query: {
        queryKey: [
          'reports',
          selectedWorkspaceId,
          pageSize,
          page,
          sortBy,
          sortOrder,
          filter,
          activeTab,
        ],
      },
    },
  );

  const summaryMutation = useReportsControllerGenerateSummaryReport({
    mutation: {
      onSuccess: () => {
        setGenerateOpen(false);
        resetForm();
        toast.success('Summary report generated successfully');
        refetch();
      },
      onError: () => {
        toast.error('Failed to generate summary report');
      },
    },
  });

  const vulMutation = useReportsControllerGenerateVulReport({
    mutation: {
      onSuccess: () => {
        setGenerateOpen(false);
        resetForm();
        toast.success('Vulnerability report generated successfully');
        refetch();
      },
      onError: () => {
        toast.error('Failed to generate vulnerability report');
      },
    },
  });

  const deleteMutation = useReportsControllerDeleteReport({
    mutation: {
      onSuccess: () => {
        toast.success('Report deleted successfully');
        refetch();
      },
      onError: () => {
        toast.error('Failed to delete report');
      },
    },
  });

  const resetForm = () => {
    setReportType('SUMMARY');
    setDateRange(undefined);
    setMinSeverity('');
  };

  const handleGenerate = () => {
    if (reportType === 'SUMMARY') {
      summaryMutation.mutate({
        data: {
          startDate: dateRange?.from?.toISOString(),
          endDate: dateRange?.to?.toISOString(),
        },
      });
    } else {
      vulMutation.mutate({
        data: {
          startDate: dateRange?.from?.toISOString(),
          endDate: dateRange?.to?.toISOString(),
          minSeverity: minSeverity
            ? (minSeverity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO')
            : undefined,
        },
      });
    }
  };

  const handleDownload = (report: ReportResponseDto) => {
    window.open(report.downloadUrl, '_blank');
  };

  const handleDelete = (report: ReportResponseDto) => {
    deleteMutation.mutate({ id: report.id });
  };

  const reports = data?.data ?? [];
  const total = data?.total ?? 0;
  const isPending = summaryMutation.isPending || vulMutation.isPending;

  const columns: ColumnDef<ReportResponseDto>[] = [
    {
      accessorKey: 'fileName',
      header: 'File name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2 font-medium">
          <FileText className="h-4 w-4 text-slate-400" />
          {row.getValue('fileName')}
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => {
        const value: string = row.getValue('createdAt');
        return (
          <div className="text-gray-400 font-semibold">
            {dayjs(value).fromNow()}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(row.original);
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
          <ConfirmDialog
            title="Delete Report"
            description={`Are you sure you want to delete "${row.original.fileName}"?`}
            confirmText="Delete"
            disabled={deleteMutation.isPending}
            onConfirm={() => handleDelete(row.original)}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      ),
    },
  ];

  if (wsLoading) return null;

  return (
    <Page title="Reports" action={null}>
      <Dialog
        open={generateOpen}
        onOpenChange={(open) => {
          setGenerateOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Report Type */}
            <Field>
              <Label className="text-sm font-medium mb-2 block">
                Report Type
              </Label>
              <RadioGroup
                value={reportType}
                onValueChange={(v) => {
                  setReportType(v as ReportType);
                  setMinSeverity('');
                }}
              >
                <div className="flex items-center space-x-2 mb-2">
                  <RadioGroupItem value="SUMMARY" id="summary" />
                  <Label
                    htmlFor="summary"
                    className="font-medium cursor-pointer"
                  >
                    Summary Report
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="VULNERABILITY" id="vulnerability" />
                  <Label
                    htmlFor="vulnerability"
                    className="font-medium cursor-pointer"
                  >
                    Vulnerability Report
                  </Label>
                </div>
              </RadioGroup>
            </Field>

            {/* Date Range - for both types */}
            <DatePickerWithRange
              value={dateRange}
              onChange={setDateRange}
              label="Date range (optional)"
            />

            {/* Min Severity - vuln only */}
            {reportType === 'VULNERABILITY' && (
              <Field>
                <Label className="text-sm font-medium mb-2 block">
                  Minimum Severity
                </Label>
                <Select value={minSeverity} onValueChange={setMinSeverity}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All severities" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className={opt.color}>{opt.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGenerateOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={isPending}>
              {isPending ? 'Generating...' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {workspaces.length === 0 ? (
        <CreateWorkspace />
      ) : !data && !isLoading ? (
        <DataTableError message="Failed to load reports." onRetry={refetch} />
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as TabValue);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="SUMMARY">Summary</TabsTrigger>
            <TabsTrigger value="VULNERABILITY">Vulnerability</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
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
              onSortChange={(col, order) => {
                setParams({ sortBy: col, sortOrder: order });
              }}
              filterColumnKey="fileName"
              filterValue={filter}
              onFilterChange={setFilter}
              totalItems={total}
            />
          </TabsContent>
          <TabsContent value="SUMMARY">
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
              onSortChange={(col, order) => {
                setParams({ sortBy: col, sortOrder: order });
              }}
              filterColumnKey="fileName"
              filterValue={filter}
              onFilterChange={setFilter}
              totalItems={total}
            />
          </TabsContent>
          <TabsContent value="VULNERABILITY">
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
              onSortChange={(col, order) => {
                setParams({ sortBy: col, sortOrder: order });
              }}
              filterColumnKey="fileName"
              filterValue={filter}
              onFilterChange={setFilter}
              totalItems={total}
            />
          </TabsContent>
          <TabsContent value="templates">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 mt-4">
              {/* Summary Report Template */}
              <div
                role="button"
                tabIndex={0}
                className="group rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setReportType('SUMMARY');
                  setGenerateOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setReportType('SUMMARY');
                    setGenerateOpen(true);
                  }
                }}
              >
                <div className="aspect-[3/4] bg-muted p-3 flex items-center justify-center">
                  <div className="w-full rounded-lg bg-card shadow-sm border p-2 space-y-1.5">
                    <div className="h-1.5 w-12 bg-muted rounded" />
                    <div className="flex items-end gap-0.5 h-8">
                      <div
                        className="flex-1 bg-blue-400 rounded-t"
                        style={{ height: '60%' }}
                      />
                      <div
                        className="flex-1 bg-blue-300 rounded-t"
                        style={{ height: '80%' }}
                      />
                      <div
                        className="flex-1 bg-blue-500 rounded-t"
                        style={{ height: '45%' }}
                      />
                      <div
                        className="flex-1 bg-blue-300 rounded-t"
                        style={{ height: '90%' }}
                      />
                      <div
                        className="flex-1 bg-blue-400 rounded-t"
                        style={{ height: '70%' }}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <div className="h-1 w-full bg-muted rounded" />
                      <div className="h-1 w-2/3 bg-muted rounded" />
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2">
                  <p className="font-semibold text-xs leading-tight">
                    Summary Report
                  </p>
                </div>
              </div>

              {/* Vulnerability Report Template */}
              <div
                role="button"
                tabIndex={0}
                className="group rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setReportType('VULNERABILITY');
                  setGenerateOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setReportType('VULNERABILITY');
                    setGenerateOpen(true);
                  }
                }}
              >
                <div className="aspect-[3/4] bg-muted p-3 flex items-center justify-center">
                  <div className="w-full rounded-lg bg-card shadow-sm border p-2 space-y-1.5">
                    <div className="h-1.5 w-14 bg-muted rounded" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-red-400" />
                        <div className="h-1 flex-1 bg-muted rounded" />
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-orange-400" />
                        <div className="h-1 flex-1 bg-muted rounded" />
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-yellow-400" />
                        <div className="h-1 flex-1 bg-muted rounded" />
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-blue-400" />
                        <div className="h-1 flex-1 bg-muted rounded" />
                      </div>
                    </div>
                    <div className="space-y-0.5 pt-0.5">
                      <div className="h-1 w-full bg-muted rounded" />
                      <div className="h-1 w-3/4 bg-muted rounded" />
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2">
                  <p className="font-semibold text-xs leading-tight">
                    Vulnerability Report
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </Page>
  );
}
