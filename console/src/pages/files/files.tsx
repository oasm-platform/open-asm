import Page from '@/components/common/page';
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
  artifactsControllerComplete,
  artifactsControllerDownload,
  artifactsControllerPresign,
  useArtifactsControllerGetMany,
  useArtifactsControllerGetUsage,
  useArtifactsControllerRemove,
  type ArtifactDto,
  type ArtifactsControllerGetManyScope,
} from '@/services/apis/gen/queries';
import { uploadToPresignedPost } from '@/services/storage';
import { formatBytes } from '@/utils/format-bytes';
import { useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Bot,
  Download,
  FileText,
  Pencil,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { RenameFileDialog } from './components/rename-file-dialog';
import { ShareFileDialog } from './components/share-file-dialog';
import { StorageUsage } from './components/storage-usage';

dayjs.extend(relativeTime);

const MIME_TYPE = /^[\w.+-]+\/[\w.+-]+$/;

const ACCESS_LABEL: Record<ArtifactDto['shareType'], string> = {
  private: 'Private',
  shared: 'Shared',
  public: 'Public',
};

export function Files() {
  const { hasPermission } = usePermission();
  const canWrite = hasPermission('artifact.write');
  const canManage = hasPermission('artifact.manage');
  const [scope, setScope] = useQueryTab({
    tabParam: 'tab',
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sharing, setSharing] = useState<ArtifactDto | null>(null);
  const [renaming, setRenaming] = useState<ArtifactDto | null>(null);

  const { data, isLoading } = useArtifactsControllerGetMany(
    {
      limit: pageSize,
      page,
      sortBy,
      sortOrder,
      search: filter,
      scope: scope as ArtifactsControllerGetManyScope,
    },
    {
      query: {
        queryKey: [
          'artifacts',
          selectedWorkspaceId,
          scope,
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

  const removeMutation = useArtifactsControllerRemove({
    mutation: {
      onSuccess: () => {
        toast.success('File deleted');
        refresh();
      },
      onError: handleServerError,
    },
  });

  const uploadFiles = async (files: File[]) => {
    setUploading(true);
    for (const file of files) {
      if (usage && file.size > usage.maxFileBytes) {
        toast.error(
          `${file.name} is larger than ${formatBytes(usage.maxFileBytes)}`,
        );
        continue;
      }
      try {
        const contentType = MIME_TYPE.test(file.type)
          ? file.type
          : 'application/octet-stream';
        const { artifact, upload } = await artifactsControllerPresign({
          fileName: file.name,
          sizeBytes: file.size,
          contentType,
        });
        await uploadToPresignedPost(upload.url, upload.fields, file);
        await artifactsControllerComplete(artifact.id);
        toast.success(`Uploaded ${file.name}`);
      } catch (error) {
        handleServerError(error);
      }
    }
    setUploading(false);
    refresh();
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
            {file.isOwner && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Share ${file.name}`}
                  onClick={() => setSharing(file)}
                >
                  <Share2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Rename ${file.name}`}
                  onClick={() => setRenaming(file)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </>
            )}
            {(file.isOwner || canManage) && (
              <ConfirmDialog
                title="Delete file"
                description={`Delete "${file.name}"? This cannot be undone.`}
                confirmText="Delete"
                disabled={removeMutation.isPending}
                onConfirm={() => removeMutation.mutate({ id: file.id })}
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
    <Page
      title="Files"
      description="Store files for this workspace and share them with members or by link"
      permission="artifact.read"
    >
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
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void uploadFiles(files);
        }}
      />
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
        toolbarComponents={
          canWrite
            ? [
                <Button
                  key="upload"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload />
                  {uploading ? 'Uploading…' : 'Upload'}
                </Button>,
              ]
            : []
        }
        emptyMessage={
          scope === 'shared' ? 'Nothing has been shared with you' : 'No files yet'
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
      {renaming && (
        <RenameFileDialog
          file={renaming}
          onOpenChange={(open) => !open && setRenaming(null)}
          onChanged={refresh}
        />
      )}
    </Page>
  );
}
