import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, useQueryTab } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/usePermission';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { handleServerError } from '@/lib/handle-server-error';
import {
  artifactsControllerComplete,
  artifactsControllerDownload,
  artifactsControllerPresign,
  useArtifactFoldersControllerCreate,
  useArtifactFoldersControllerRemove,
  useArtifactFoldersControllerUpdate,
  useArtifactsControllerGetMany,
  useArtifactsControllerGetUsage,
  useArtifactsControllerRemove,
  useArtifactsControllerUpdate,
  type ArtifactDto,
  type ArtifactFolderDto,
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
  Folder,
  FolderInput,
  FolderPlus,
  MoreVertical,
  Pencil,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FolderBreadcrumb } from './components/folder-breadcrumb';
import { MoveDialog } from './components/move-dialog';
import { NameDialog } from './components/name-dialog';
import { ShareFileDialog } from './components/share-file-dialog';
import { StorageUsage } from './components/storage-usage';
import { useFolderPath, useFolders } from './components/use-folders';

dayjs.extend(relativeTime);

const MIME_TYPE = /^[\w.+-]+\/[\w.+-]+$/;

const ACCESS_LABEL: Record<ArtifactDto['shareType'], string> = {
  private: 'Private',
  shared: 'Shared',
  public: 'Public',
};

type NamePrompt =
  | { kind: 'new-folder' }
  | { kind: 'rename-file'; file: ArtifactDto }
  | { kind: 'rename-folder'; folder: ArtifactFolderDto };

type MoveTarget =
  | { kind: 'file'; file: ArtifactDto }
  | { kind: 'folder'; folder: ArtifactFolderDto };

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
  const [folderId, setFolderId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<ArtifactDto | null>(null);
  const [namePrompt, setNamePrompt] = useState<NamePrompt | null>(null);
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const [deletingFolder, setDeletingFolder] =
    useState<ArtifactFolderDto | null>(null);

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
  const done = (message: string) => () => {
    toast.success(message);
    setNamePrompt(null);
    setMoving(null);
    refresh();
  };

  const removeFile = useArtifactsControllerRemove({
    mutation: { onSuccess: done('File deleted'), onError: handleServerError },
  });
  const updateFile = useArtifactsControllerUpdate({
    mutation: { onSuccess: done('File updated'), onError: handleServerError },
  });
  const createFolder = useArtifactFoldersControllerCreate({
    mutation: { onSuccess: done('Folder created'), onError: handleServerError },
  });
  const updateFolder = useArtifactFoldersControllerUpdate({
    mutation: { onSuccess: done('Folder updated'), onError: handleServerError },
  });
  const removeFolder = useArtifactFoldersControllerRemove({
    mutation: {
      onSuccess: () => {
        setDeletingFolder(null);
        done('Folder deleted')();
      },
      onError: handleServerError,
    },
  });

  const openFolder = (id: string | null) => {
    setFolderId(id);
    setPage(1);
  };

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
          parentFolderId: currentFolderId ?? undefined,
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

  const submitName = (name: string) => {
    if (!namePrompt) return;
    if (namePrompt.kind === 'new-folder') {
      createFolder.mutate({
        data: { name, parentFolderId: currentFolderId ?? undefined },
      });
    } else if (namePrompt.kind === 'rename-file') {
      updateFile.mutate({ id: namePrompt.file.id, data: { name } });
    } else {
      updateFolder.mutate({ id: namePrompt.folder.id, data: { name } });
    }
  };

  const moveTo = (parentFolderId: string | null) => {
    if (moving?.kind === 'file') {
      updateFile.mutate({ id: moving.file.id, data: { parentFolderId } });
    } else if (moving) {
      updateFolder.mutate({ id: moving.folder.id, data: { parentFolderId } });
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
                  onClick={() => setNamePrompt({ kind: 'rename-file', file })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Move ${file.name}`}
                  onClick={() => setMoving({ kind: 'file', file })}
                >
                  <FolderInput className="h-4 w-4" />
                </Button>
              </>
            )}
            {(file.isOwner || canManage) && (
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
      {inMine && <FolderBreadcrumb path={path} onNavigate={openFolder} />}
      {showFolders && !!folders.data?.length && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {folders.data.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center gap-1 rounded-lg border pl-3 hover:bg-muted/50"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm font-medium"
                onClick={() => openFolder(folder.id)}
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{folder.name}</span>
              </button>
              {canWrite && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${folder.name}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() =>
                        setNamePrompt({ kind: 'rename-folder', folder })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setMoving({ kind: 'folder', folder })}
                    >
                      <FolderInput className="h-4 w-4" />
                      Move
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-500"
                      onSelect={() => setDeletingFolder(folder)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}
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
                ...(inMine
                  ? [
                      <Button
                        key="new-folder"
                        variant="outline"
                        onClick={() => setNamePrompt({ kind: 'new-folder' })}
                      >
                        <FolderPlus />
                        New folder
                      </Button>,
                    ]
                  : []),
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
      {namePrompt && (
        <NameDialog
          title={
            namePrompt.kind === 'new-folder'
              ? 'New folder'
              : namePrompt.kind === 'rename-file'
                ? 'Rename file'
                : 'Rename folder'
          }
          initialName={
            namePrompt.kind === 'rename-file'
              ? namePrompt.file.name
              : namePrompt.kind === 'rename-folder'
                ? namePrompt.folder.name
                : ''
          }
          submitLabel={namePrompt.kind === 'new-folder' ? 'Create' : 'Save'}
          pending={
            createFolder.isPending ||
            updateFile.isPending ||
            updateFolder.isPending
          }
          onSubmit={submitName}
          onOpenChange={(open) => !open && setNamePrompt(null)}
        />
      )}
      {moving && (
        <MoveDialog
          title={`Move "${moving.kind === 'file' ? moving.file.name : moving.folder.name}"`}
          currentParentId={
            moving.kind === 'file'
              ? moving.file.parentFolderId
              : moving.folder.parentFolderId
          }
          excludeFolderId={moving.kind === 'folder' ? moving.folder.id : undefined}
          pending={updateFile.isPending || updateFolder.isPending}
          onMove={moveTo}
          onOpenChange={(open) => !open && setMoving(null)}
        />
      )}
      <ConfirmDialog
        open={!!deletingFolder}
        onOpenChange={(open) => !open && setDeletingFolder(null)}
        title="Delete folder"
        description={`Delete "${deletingFolder?.name}" and everything in it? This cannot be undone.`}
        confirmText="Delete"
        disabled={removeFolder.isPending}
        onConfirm={() =>
          deletingFolder && removeFolder.mutate({ id: deletingFolder.id })
        }
      />
    </Page>
  );
}
