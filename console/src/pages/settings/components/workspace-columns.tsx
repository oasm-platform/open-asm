import { Badge } from '@/components/ui/badge';
import type { Workspace } from '@/services/apis/gen/queries';
import { type ColumnDef } from '@tanstack/react-table';
import { t } from '@/lib/i18n-dictionary';
import DeleteWorkspace from './delete-workspace';
import { EditWorkspaceDialog } from './edit-workspace-dialog';
import ShowNameWorkspace from './show-name-workspace';

export const workspaceColumns: ColumnDef<Workspace, unknown>[] = [
  {
    accessorKey: 'name',
    header: () => t('settings.workspace.columns.name'),
    cell: ({ row }) => (
      <ShowNameWorkspace workspace={row.original as Workspace} />
    ),
  },
  {
    accessorKey: 'description',
    header: () => t('common.description'),
    cell: ({ row }) => (
      <div className="text-gray-500">
        {row.getValue('description') || t('settings.workspace.columns.noDescription')}
      </div>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: () => t('settings.workspace.columns.createdAt'),
    cell: ({ row }) => (
      <div className="text-gray-500">
        {new Date(row.getValue('createdAt')).toLocaleDateString()}
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: () => t('common.status'),
    cell: ({ row }) => {
      const workspace = row.original as Workspace;
      return (
        <Badge
          className={
            workspace.archivedAt
              ? 'bg-gray-500 text-white'
              : 'bg-green-500 text-white'
          }
        >
          {workspace.archivedAt
            ? t('settings.workspace.columns.archived')
            : t('settings.workspace.columns.active')}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'actions',
    header: () => t('common.actions'),
    enableSorting: false,
    cell: ({ row }) => {
      const workspace = row.original as Workspace;
      return (
        <div className="flex justify-start gap-2">
          <EditWorkspaceDialog workspace={workspace} />
          <DeleteWorkspace workspace={workspace} />
        </div>
      );
    },
  },
];
