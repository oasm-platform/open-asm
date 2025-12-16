import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DataTable } from '@/components/ui/data-table';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useIssuesControllerGetMany, type Issue } from '@/services/apis/gen/queries';
import { type ColumnDef } from '@tanstack/react-table';
import { CheckCircleIcon, CircleIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const timeAgo = (dateFormatted: string) => {
    const date = new Date(dateFormatted);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60,
    };

    for (const [unit, value] of Object.entries(intervals)) {
        const count = Math.floor(seconds / value);
        if (count >= 1) {
            return `${count} ${unit}${count > 1 ? 's' : ''} ago`;
        }
    }
    return 'just now';
};

const issueColumns: ColumnDef<Issue>[] = [
    {
        accessorKey: 'title', // We can use title as key but render everything in this cell
        header: '', // Empty header
        cell: ({ row }) => {
            const issue = row.original;
            const status = issue.status;
            let statusColor = "text-gray-500";
            let StatusIcon = CircleIcon;

            if (status?.toLowerCase() === 'open') {
                statusColor = "text-green-500";
                StatusIcon = CircleIcon;
            } else if (status?.toLowerCase() === 'closed') {
                statusColor = "text-purple-500";
                StatusIcon = CheckCircleIcon;
            }

            return (
                <div className="flex items-start gap-3 py-1">
                    <StatusIcon className={`mt-1 h-5 w-5 ${statusColor}`} />
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
                                </span> opened {timeAgo(issue.createdAt)}
                            </span>
                        </div>
                    </div>
                    {issue.createdBy && (
                        <div className="ml-4">
                            <Avatar className="h-6 w-6">
                                <AvatarImage src={issue.createdBy.image} alt={issue.createdBy.name} />
                                <AvatarFallback>{issue.createdBy.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                        </div>
                    )}
                </div>
            );
        },
    }
];

export function ListIssues() {
    const navigate = useNavigate();

    const {
        tableParams: { page, pageSize, sortBy, sortOrder, filter },
        tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder, setFilter },
    } = useServerDataTable();

    const { data, isLoading } = useIssuesControllerGetMany(
        {
            limit: pageSize,
            page,
            sortBy: sortBy || 'createdAt',
            sortOrder,
        },
        {
            query: {
                queryKey: [
                    'issues',
                    pageSize,
                    page,
                    sortBy,
                    sortOrder,
                    filter
                ]
            }
        }
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
            onSortChange={(col, order) => {
                setSortBy(col);
                setSortOrder(order);
            }}
            filterColumnKey="title"
            filterValue={filter}
            onFilterChange={setFilter}
            totalItems={total}
            onRowClick={handleRowClick}
            rowClassName="cursor-pointer hover:bg-muted/50 transition-colors"
        />
    );
}
