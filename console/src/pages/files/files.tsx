import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { Tabs, TabsList, TabsTrigger, useQueryTab } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/usePermission';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { handleServerError } from '@/lib/handle-server-error';
import {
  artifactsControllerDownload,
  useArtifactsControllerGetMany,
  useArtifactsControllerGetUsage,
  useArtifactsControllerRemove,
  type ArtifactDto,
  type ArtifactsControllerGetManyScope,
} from '@/services/apis/gen/queries';
import { formatBytes } from '@/utils/format-bytes';
import { useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Bot,
  Download,
  FileText,
  Folder,
  Share2,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FolderBreadcrumb } from './components/folder-breadcrumb';
import { ShareFileDialog } from './components/share-file-dialog';
import { StorageUsage } from './components/storage-usage';
import { useFolderPath, useFolders } from './components/use-folders';

dayjs.extend(relativeTime);

const ACCESS_LABEL: Record<ArtifactDto['shareType'], string> = {
  private: 'Private',
  shared: 'Shared',
  public: 'Public',
};

export function Files() {
  const { hasPermission } = usePermission();
  const canManage = hasPermission('artifact.manage');
  const canWrite = hasPermission('artifact.write');
  const [scope, setScope] = useQueryTab({
    tabParam: 'scope',
    defaultValue: 'mine',
    validValues: ['mine', 'shared', 'all'],
  });
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setFilter, setParams },
  } = useServerDataTable();
  const queryClient = useQueryClient();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<ArtifactDto | null>(null);

  // Folders only exist in "My files"; a search there spans all of them.
  const inMine = scope === 'mine';
  const currentFolderId = inMine ? folderId : null;
  const showFolders = inMine && !filter;
  const folders = useFolders(currentFolderId, showFolders);
  const path = useFolderPath(currentFolderId);

  const { data, isLoading } = useArtifactsControllerGetMany(
    {
      limit: pageSize,
      page,
      sortBy,
      sortOrder,
      search: filter,
      scope: scope as ArtifactsControllerGetManyScope,
      parentFolderId: currentFolderId ?? undefined,
    },
    {
      query: {
        queryKey: [
          'artifacts',
          selectedWorkspaceId,
          scope,
          currentFolderId,
          pageSize,
          page,
          sortBy,
          sortOrder,
          filter,
        ],
      },
    },
  );
  const { data: usage } = useArtifactsControllerGetUsage({
    query: { queryKey: ['artifacts', 'usage', selectedWorkspaceId] },
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['artifacts'] });

  const removeFile = useArtifactsControllerRemove({
    mutation: {
      onSuccess: () => {
        toast.success('File deleted');
        refresh();
      },
      onError: handleServerError,
    },
  });

  const openFolder = (id: string | null) => {
    setFolderId(id);
    setPage(1);
  };

  const download = async (file: ArtifactDto) => {
    try {
      const { url } = await artifactsControllerDownload(file.id);
      // The URL forces `Content-Disposition: attachment`, so the page stays put.
      window.location.assign(url);
    } catch (error) {
      handleServerError(error);
    }
  };

  const columns: ColumnDef<ArtifactDto>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2 font-medium">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{row.original.name}</span>
          {row.original.source === 'agent' && (
            <Badge variant="secondary" className="gap-1">
              <Bot className="h-3 w-3" />
              Agent
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'sizeBytes',
      header: 'Size',
      cell: ({ row }) =>
        row.original.sizeBytes ? formatBytes(row.original.sizeBytes) : '0 B',
    },
    {
      accessorKey: 'shareType',
      header: 'Access',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant="outline">{ACCESS_LABEL[row.original.shareType]}</Badge>
      ),
    },
    {
      id: 'owner',
      header: 'Owner',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.isOwner ? 'You' : (row.original.createdBy?.name ?? '—'),
    },
    {
      accessorKey: 'updatedAt',
      header: 'Modified',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {dayjs(row.original.updatedAt).fromNow()}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const file = row.original;
        // `all` lists other members' files for managers: metadata only.
        const canDownload = scope !== 'all' || file.isOwner;
        return (
          <div
            className="flex justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {canDownload && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Download ${file.name}`}
                onClick={() => void download(file)}
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
            {file.isOwner && canWrite && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Share ${file.name}`}
                onClick={() => setSharing(file)}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            )}
            {((file.isOwner && canWrite) || canManage) && (
              <ConfirmDialog
                title="Delete file"
                description={`Delete "${file.name}"? This cannot be undone.`}
                confirmText="Delete"
                disabled={removeFile.isPending}
                onConfirm={() => removeFile.mutate({ id: file.id })}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${file.name}`}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <StorageUsage usage={usage} />
      <Tabs
        value={scope}
        onValueChange={(value) => {
          setScope(value);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="mine">My files</TabsTrigger>
          <TabsTrigger value="shared">Shared with me</TabsTrigger>
          {canManage && <TabsTrigger value="all">All files</TabsTrigger>}
        </TabsList>
      </Tabs>
      {/* Only inside a folder: at the root it would just repeat the tab. */}
      {currentFolderId && (
        <FolderBreadcrumb path={path} onNavigate={openFolder} />
      )}
      {showFolders && !!folders.data?.length && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {folders.data.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center rounded-lg border px-3 hover:bg-muted/50"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm font-medium"
                onClick={() => openFolder(folder.id)}
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{folder.name}</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <DataTable
        data={data?.data ?? []}
        columns={columns}
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        totalItems={data?.total ?? 0}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(column, order) =>
          setParams({ sortBy: column, sortOrder: order })
        }
        emptyMessage={
          scope === 'shared'
            ? 'Nothing has been shared with you'
            : currentFolderId
              ? 'No files in this folder'
              : 'No files yet'
        }
        filterColumnKey="name"
        filterValue={filter}
        onFilterChange={setFilter}
      />
      {sharing && (
        <ShareFileDialog
          file={sharing}
          onOpenChange={(open) => !open && setSharing(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
