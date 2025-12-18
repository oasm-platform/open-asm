import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useIssuesControllerGetMany,
  type Issue,
} from '@/services/apis/gen/queries';
import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useNavigate } from 'react-router-dom';

dayjs.extend(relativeTime);

const issueColumns: ColumnDef<Issue>[] = [
  {
    accessorKey: 'title', // We can use title as key but render everything in this cell
    header: '', // Empty header
    cell: ({ row }) => {
      const issue = row.original;
      const status = issue.status;

      return (
        <div className="flex items-start gap-3 py-1">
          <StatusBadge status={status} className="h-8 px-2" />
          <div className="flex-1 flex flex-col gap-1">
            <div className="font-semibold text-base text-foreground">
              {issue.title}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>#{issue.no || issue.id?.slice(0, 8)}</span>
              <span>•</span>
              <span>
                <span className="font-medium text-foreground hover:underline cursor-pointer">
                  {issue.createdBy?.name || 'Unknown'}
                </span>{' '}
                opened {dayjs(issue.createdAt).fromNow()}
              </span>
            </div>
          </div>
        </div>
      );
    },
  },
];

export function ListIssues() {
  const navigate = useNavigate();

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder, setFilter },
  } = useServerDataTable({
    // Enable URL parameter synchronization for search/filter functionality
    isUpdateSearchQueryParam: true,
  });

  const { data, isLoading } = useIssuesControllerGetMany(
    {
      limit: pageSize,
      page,
      sortBy: sortBy || 'createdAt',
      sortOrder,
      // Pass the filter/search parameter to the API call
      search: filter,
    },
    {
      query: {
        queryKey: ['issues', pageSize, page, sortBy, sortOrder, filter],
      },
    },
  );

  const issues = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleRowClick = (issue: Issue) => {
    navigate(`/issues/${issue.id}`);
  };

  return (
    <DataTable
      data={issues}
      columns={issueColumns}
      isLoading={isLoading}
      page={page}
      pageSize={pageSize}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      isShowHeader={false}
      onSortChange={(col, order) => {
        setSortBy(col);
        setSortOrder(order);
      }}
      // Use filterColumnKey to specify which column to filter on
      filterColumnKey="title"
      filterValue={filter}
      onFilterChange={setFilter}
      totalItems={total}
      onRowClick={handleRowClick}
      rowClassName="cursor-pointer hover:bg-muted/50 transition-colors"
    />
  );
}
