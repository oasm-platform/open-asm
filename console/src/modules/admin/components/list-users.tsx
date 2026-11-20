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
import { type TFunction, useT } from '@/lib/i18n-dictionary';
import { AddUserDialog } from './add-user-dialog';
import { UserPresence } from './user-presence';

const buildUserColumns = (
  t: TFunction,
  ownerId?: string,
): ColumnDef<AdminUserDto>[] => [
  {
    accessorKey: 'name',
    header: t('common.name'),
    enableSorting: true,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span>{row.original.name}</span>
        {row.original.id === ownerId && (
          <Badge variant="outline">{t('admin.users.owner')}</Badge>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'email',
    header: t('admin.users.col.email'),
    enableSorting: true,
  },
  {
    accessorKey: 'role',
    header: t('admin.users.col.role'),
    cell: ({ row }) => (
      <Badge variant="secondary" className="capitalize">
        {row.original.role}
      </Badge>
    ),
  },
  {
    accessorKey: 'banned',
    header: t('common.status'),
    cell: ({ row }) =>
      row.original.pendingApproval ? (
        <Badge variant="outline">
          {t('admin.detail.status.pendingApproval')}
        </Badge>
      ) : row.original.banned ? (
        <Badge variant="destructive">
          {t('admin.detail.status.banned')}
        </Badge>
      ) : (
        <Badge variant="secondary">
          {t('admin.detail.status.active')}
        </Badge>
      ),
  },
  {
    accessorKey: 'lastActiveAt',
    header: t('admin.users.col.lastActive'),
    // Presence lives in Redis, so the server cannot sort by it.
    enableSorting: false,
    cell: ({ row }) => (
      <UserPresence lastActiveAt={row.original.lastActiveAt} />
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
  const t = useT();
  const columns = useMemo(() => buildUserColumns(t, ownerId), [t, ownerId]);

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
      emptyMessage={workspaceId ? t('admin.users.emptyMembers') : t('admin.users.empty')}
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
