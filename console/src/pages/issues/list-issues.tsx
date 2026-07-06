import { StatusFilter } from '@/components/issues/status-filter';
import { Badge } from '@/components/ui/badge';
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
import { Tag } from 'lucide-react';
import { type IssuesControllerGetManyStatusItem } from '@/services/apis/gen/queries';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{ p: 'div' }} // Render paragraph as div to avoid nesting issues if needed, or stick to default
              >
                {issue.title}
              </ReactMarkdown>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>#{issue.no || issue.id?.slice(0, 8)}</span>
              <span>•</span>
              <span>
                <span className="font-medium hover:underline cursor-pointer">
                  {issue.createdBy?.name || 'Unknown'}
                </span>{' '}
                opened {dayjs(issue.createdAt).fromNow()}
              </span>
              {issue.tags && issue.tags.length > 0 && (
                <>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    {issue.tags.slice(0, 3).map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="h-5 px-1.5 text-[10px] gap-0.5"
                      >
                        <Tag size={10} />
                        {tag}
                      </Badge>
                    ))}
                    {issue.tags.length > 3 && (
                      <span className="text-muted-foreground text-[10px]">
                        +{issue.tags.length - 3} more
                      </span>
                    )}
                  </div>
                </>
              )}
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
    tableHandlers: { setPage, setPageSize, setFilter, setParams },
  } = useServerDataTable({
    // Enable URL parameter synchronization for search/filter functionality
    isUpdateSearchQueryParam: true,
  });

  // State for status filter
  const [statusFilter, setStatusFilter] = useState<
    IssuesControllerGetManyStatusItem | 'all'
  >('open');

  const handleStatusFilterChange = (
    value: IssuesControllerGetManyStatusItem | 'all',
  ) => {
    setStatusFilter(value);
  };

  const { data, isLoading } = useIssuesControllerGetMany(
    {
      limit: pageSize,
      page,
      sortBy: sortBy || 'createdAt',
      sortOrder,
      // Pass the filter/search parameter to the API call
      search: filter,
      // Add status filter - convert to array as expected by API
      ...(statusFilter !== 'all' && { status: [statusFilter] }),
    },
    {
      query: {
        queryKey: [
          'issues',
          pageSize,
          page,
          sortBy,
          sortOrder,
          filter,
          statusFilter,
        ],
      },
    },
  );

  const issues = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleRowClick = (issue: Issue) => {
    navigate({ to: `/issues/${issue.id}` });
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
      toolbarComponents={[
        <StatusFilter
          key="status-filter"
          value={statusFilter}
          onValueChange={handleStatusFilterChange}
        />,
      ]}
      isShowHeader={false}
      onSortChange={(col, order) => {
        setParams({ sortBy: col, sortOrder: order });
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
