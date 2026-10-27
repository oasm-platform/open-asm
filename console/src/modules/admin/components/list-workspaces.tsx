import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useAdminWorkspacesControllerGetWorkspaces,
  type AdminWorkspaceDto,
} from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';

const workspaceColumns: ColumnDef<AdminWorkspaceDto>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    enableSorting: true,
  },
  {
    id: 'owner',
    header: 'Owner',
    cell: ({ row }) => {
      const owner = row.original.owner;
      if (!owner) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-6 w-6 border">
            <AvatarImage src={owner.image ?? undefined} alt={owner.name} />
            <AvatarFallback className="text-xs">
              {owner.name?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0">
            <span className="truncate">{owner.name}</span>
            <span className="text-xs text-muted-foreground truncate">
              {owner.email}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'targetCount',
    header: 'Targets',
  },
  {
    accessorKey: 'memberCount',
    header: 'Members',
  },
  {
    accessorKey: 'archivedAt',
    header: 'Status',
    cell: ({ row }) =>
      row.original.archivedAt ? (
        <Badge variant="outline">Archived</Badge>
      ) : (
        <Badge variant="secondary">Active</Badge>
      ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    enableSorting: true,
    cell: ({ row }) => format(new Date(row.original.createdAt), 'PP'),
  },
];

export function ListWorkspaces() {
  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setParams, setFilter },
  } = useServerDataTable();
  const navigate = useNavigate();

  const { data, isLoading } = useAdminWorkspacesControllerGetWorkspaces({
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
    search: filter,
  });

  return (
    <DataTable
      data={data?.data ?? []}
      columns={workspaceColumns}
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
      filterColumnKey="name"
      filterValue={filter}
      onFilterChange={setFilter}
      totalItems={data?.total}
      emptyMessage="No workspaces found"
      onRowClick={(workspace) =>
        navigate({ to: '/admin/workspaces/$id', params: { id: workspace.id } })
      }
      rowClassName="cursor-pointer hover:bg-muted/50 transition-colors"
    />
  );
}
