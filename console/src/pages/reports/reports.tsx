import type { ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Download, FileText, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
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
  const [dateRange, setDateRange] = useState<{
    from?: Date;
    to?: Date;
  }>();
  const [minSeverity, setMinSeverity] = useState<string>('');

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
    window.open(`/api/storage/${report.path}`, '_blank');
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
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.getValue('type') as string;
        const colors: Record<string, string> = {
          SUMMARY: 'border-blue-500 text-blue-500',
          VULNERABILITY: 'border-orange-500 text-orange-500',
        };
        return (
          <Badge variant="outline" className={colors[type]}>
            {type}
          </Badge>
        );
      },
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
    <Page
      title="Reports"
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-white"
            onClick={() => setGenerateOpen(true)}
            disabled={isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
        </div>
      }
    >
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
                  <Label htmlFor="summary" className="font-medium cursor-pointer">
                    Summary Report
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="VULNERABILITY" id="vulnerability" />
                  <Label htmlFor="vulnerability" className="font-medium cursor-pointer">
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
                <Select
                  value={minSeverity}
                  onValueChange={setMinSeverity}
                >
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
      )}
    </Page>
  );
}
