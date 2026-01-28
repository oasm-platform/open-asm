import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import {
  useSecurityReportControllerFindAll,
  useSecurityReportControllerRemove,
  downloadPdf,
} from '@/services/apis/gen/queries';
import { Plus } from 'lucide-react';
import Page from '@/components/common/page';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type SecurityReport } from '@/services/apis/gen/queries';
import { ReportStatus } from './types';
import { getReportColumns } from './components/report-column';

dayjs.extend(relativeTime);

const Reports = () => {
  const navigate = useNavigate();
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sorting, setSorting] = useState<{
    id: string;
    desc: boolean;
  } | null>({ id: 'updatedAt', desc: true });

  const {
    data: reportsResponse,
    isLoading: loading,
    refetch,
  } = useSecurityReportControllerFindAll();

  const processedReports = useMemo(() => {
    const allReports = Array.isArray(reportsResponse)
      ? reportsResponse
      : (reportsResponse as { data?: SecurityReport[] })?.data || [];

    let result = [...allReports];

    // Status Filter
    if (statusFilter !== 'ALL') {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Search Filter
    if (filter) {
      const search = filter.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          r.description?.toLowerCase().includes(search),
      );
    }

    // Sort
    if (sorting) {
      result.sort((a, b) => {
        let valA = a[sorting.id as keyof SecurityReport];
        let valB = b[sorting.id as keyof SecurityReport];

        if (sorting.id === 'creator') {
          valA = a.creator?.name || '';
          valB = b.creator?.name || '';
        }

        if (sorting.id === 'status') {
          valA = a.status || '';
          valB = b.status || '';
        }

        if (valA < valB) return sorting.desc ? 1 : -1;
        if (valA > valB) return sorting.desc ? -1 : 1;
        return 0;
      });
    }

    return result;
  }, [reportsResponse, filter, statusFilter, sorting]);

  const totalItems = processedReports.length;

  const paginatedReports = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize;
    const end = start + pagination.pageSize;
    return processedReports.slice(start, end);
  }, [processedReports, pagination]);

  const deleteMutation = useSecurityReportControllerRemove();

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteMutation.mutateAsync({ id });
        toast.success('Report deleted');
        refetch();
      } catch {
        toast.error('Failed to delete report');
      }
    },
    [deleteMutation, refetch],
  );

  const handleDownload = useCallback(async (id: string, name: string) => {
    try {
      const response = await downloadPdf(id, {
        responseType: 'blob',
      });

      const blob = new Blob([response as BlobPart], {
        type: 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `security_report_${name.replace(/\s+/g, '_').toLowerCase()}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error('Failed to generate PDF');
    }
  }, []);

  const columns = useMemo(
    () =>
      getReportColumns({
        onDelete: handleDelete,
        onNavigate: navigate,
        onDownload: handleDownload,
      }),
    [handleDelete, navigate, handleDownload],
  );

  return (
    <Page title="Security Reports">
      <div className="w-full">
        <DataTable
          columns={columns}
          data={paginatedReports}
          isLoading={loading}
          page={pagination.pageIndex + 1}
          pageSize={pagination.pageSize}
          totalItems={totalItems}
          onPageChange={(p) =>
            setPagination((prev) => ({ ...prev, pageIndex: p - 1 }))
          }
          onPageSizeChange={(s) =>
            setPagination((prev) => ({ ...prev, pageSize: s, pageIndex: 0 }))
          }
          onSortChange={(id, order) =>
            setSorting({ id, desc: order === 'DESC' })
          }
          sortBy={sorting?.id}
          sortOrder={sorting?.desc ? 'DESC' : 'ASC'}
          onRowClick={(row) => navigate(`/reports/${row.id}/view`)}
          filterColumnKey="name"
          filterPlaceholder="Search reports..."
          onFilterChange={setFilter}
          toolbarComponents={[
            <Select
              key="status-filter"
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                {Object.values(ReportStatus).map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
            <Button
              variant="outline"
              key="create-report"
              onClick={() => navigate('/reports/new')}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Report
            </Button>,
          ]}
        />
      </div>
    </Page>
  );
};

export default Reports;
