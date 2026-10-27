import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useAdminUsersControllerGetUsers,
  type AdminUserDto,
} from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import { type ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { AddUserDialog } from './add-user-dialog';

const buildUserColumns = (ownerId?: string): ColumnDef<AdminUserDto>[] => [
  {
    accessorKey: 'name',
    header: 'Name',
    enableSorting: true,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span>{row.original.name}</span>
        {row.original.id === ownerId && (
          <Badge variant="outline">Owner</Badge>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'email',
    header: 'Email',
    enableSorting: true,
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => (
      <Badge variant="secondary" className="capitalize">
        {row.original.role}
      </Badge>
    ),
  },
  {
    accessorKey: 'banned',
    header: 'Status',
    cell: ({ row }) =>
      row.original.banned ? (
        <Badge variant="destructive">Banned</Badge>
      ) : (
        <Badge variant="secondary">Active</Badge>
      ),
  },
];

interface ListUsersProps {
  /** Narrow the table to this workspace's members (server-side, paginated). */
  workspaceId?: string;
  /** Marks this user with an Owner badge; used with `workspaceId`. */
  ownerId?: string;
}

export function ListUsers({ workspaceId, ownerId }: ListUsersProps) {
  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setParams, setFilter },
  } = useServerDataTable();
  const navigate = useNavigate();
  const columns = useMemo(() => buildUserColumns(ownerId), [ownerId]);

  const { data, isLoading } = useAdminUsersControllerGetUsers({
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
    search: filter,
    workspaceId,
  });

  return (
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
      onSortChange={(col, order) => {
        setParams({ sortBy: col, sortOrder: order });
      }}
      toolbarComponents={
        workspaceId ? [] : [<AddUserDialog key="add-user" />]
      }
      emptyMessage={workspaceId ? 'No members found' : 'No users found'}
      filterColumnKey="value"
      filterValue={filter}
      onFilterChange={setFilter}
      totalItems={data?.total}
      onRowClick={(user) =>
        navigate({ to: '/admin/users/$id', params: { id: user.id } })
      }
      rowClassName="cursor-pointer hover:bg-muted/50 transition-colors"
    />
  );
}
