import { Badge } from '@/components/ui/badge';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { authClient, type User } from '@/utils/authClient';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { UserDetailSheet } from './user-detail-sheet';

const userColumns: ColumnDef<User>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    enableSorting: true,
  },
  {
    accessorKey: 'email',
    header: 'Email',
    enableSorting: true,
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => <Badge>{row.original.role}</Badge>,
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

export function ListUsers() {
  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setParams, setFilter },
  } = useServerDataTable();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, pageSize, sortBy, sortOrder, filter }],
    queryFn: () =>
      authClient.admin.listUsers({
        query: {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          searchField: 'name',
          searchValue: filter,
          filterField: 'role',
          filterOperator: 'ne',
          filterValue: 'bot',
          sortBy: sortBy,
          sortDirection: sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
  });

  if (!data) return null;

  return (
    <>
      <DataTable
        data={(data.data?.users as User[]) || []}
        columns={userColumns}
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
        filterColumnKey="value"
        filterValue={filter}
        onFilterChange={setFilter}
        totalItems={data.data?.total}
        onRowClick={setSelectedUser}
        rowClassName="cursor-pointer hover:bg-muted/50 transition-colors"
      />
      <UserDetailSheet
        user={selectedUser}
        onOpenChange={(open) => !open && setSelectedUser(null)}
      />
    </>
  );
}
