import type { ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Download,
  FileText,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useWorkspaceSelector,
  useWorkspaceState,
} from '@/hooks/useWorkspaceSelector';
import type { ReportResponseDto } from '@/services/apis/gen/queries';
import {
  useReportsControllerDeleteReport,
  useReportsControllerGenerateReport,
  useReportsControllerGetMany,
} from '@/services/apis/gen/queries';
import CreateWorkspace from '../workspaces/create-workspace';

dayjs.extend(relativeTime);

export default function Reports() {
  const [generateOpen, setGenerateOpen] = useState(false);
  const [reportType, setReportType] = useState<'SUMMARY' | 'VULNERABILITY'>(
    'SUMMARY',
  );

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

  const generateMutation = useReportsControllerGenerateReport({
    mutation: {
      onSuccess: () => {
        setGenerateOpen(false);
        toast.success('Report generated successfully');
        refetch();
      },
      onError: () => {
        toast.error('Failed to generate report');
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

  const handleDownload = (report: ReportResponseDto) => {
    window.open(`/api/storage/${report.path}`, '_blank');
  };

  const handleDelete = (report: ReportResponseDto) => {
    deleteMutation.mutate({ id: report.id });
  };

  const reports = data?.data ?? [];
  const total = data?.total ?? 0;

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
            disabled={generateMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
        </div>
      }
    >
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Report</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <RadioGroup
              value={reportType}
              onValueChange={(v) =>
                setReportType(v as 'SUMMARY' | 'VULNERABILITY')
              }
            >
              <div className="flex items-center space-x-2 mb-3">
                <RadioGroupItem value="SUMMARY" id="summary" />
                <Label htmlFor="summary" className="font-medium">
                  Summary Report
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="VULNERABILITY" id="vulnerability" />
                <Label htmlFor="vulnerability" className="font-medium">
                  Vulnerability Report
                </Label>
              </div>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGenerateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                generateMutation.mutate({ data: { type: reportType } })
              }
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? 'Generating...' : 'Generate'}
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
