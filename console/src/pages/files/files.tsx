import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, useQueryTab } from '@/components/ui/tabs';
import useDebounce from '@/hooks/use-debounce';
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
  type ArtifactFolderDto,
  type ArtifactsControllerGetManyScope,
} from '@/services/apis/gen/queries';
import { formatBytes } from '@/utils/format-bytes';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowUpNarrowWide,
  Bot,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  List,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileGrid, type FileActions } from './components/file-grid';
import { FileIcon, FolderIcon } from './components/file-icon';
import { FolderBreadcrumb } from './components/folder-breadcrumb';
import { ShareFileDialog } from './components/share-file-dialog';
import { StorageUsage } from './components/storage-usage';
import { useFolderPath, useFolders } from './components/use-folders';

dayjs.extend(relativeTime);

type FolderRow = ArtifactFolderDto & { isFolder: true };
type Row = ArtifactDto | FolderRow;
const isFolder = (row: Row): row is FolderRow => 'isFolder' in row;

type ViewMode = 'grid' | 'list';
const VIEW_KEY = 'oasm.files.view';

const ACCESS_LABEL: Record<ArtifactDto['shareType'], string> = {
  private: 'Private',
  shared: 'Shared',
  public: 'Public',
};

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'updatedAt', label: 'Modified' },
  { value: 'createdAt', label: 'Created' },
  { value: 'sizeBytes', label: 'Size' },
];

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

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
  } = useServerDataTable({ defaultPageSize: 50 });
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>(readViewMode);
  const [sharing, setSharing] = useState<ArtifactDto | null>(null);
  const [deleting, setDeleting] = useState<ArtifactDto | null>(null);
  const [searchValue, setSearchValue] = useState(filter);
  const debouncedSearch = useDebounce(searchValue, 400);

  useEffect(() => {
    setFilter(debouncedSearch);
  }, [debouncedSearch, setFilter]);

  // The open folder lives in the URL so Back/Forward walk the folder history.
  // Folders only exist in "My files"; a search there spans all of them.
  const inMine = scope === 'mine';
  const folderId =
    typeof search.folder === 'string' && search.folder ? search.folder : null;
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
        setDeleting(null);
        refresh();
      },
      onError: handleServerError,
    },
  });

  const openFolder = (id: string | null) => {
    void navigate({
      search: ((prev: Record<string, unknown>) => {
        const next = { ...prev };
        delete next.page;
        if (id) next.folder = id;
        else delete next.folder;
        return next;
      }) as never,
    });
  };

  const changeScope = (value: string) => {
    setScope(value);
    void navigate({
      search: ((prev: Record<string, unknown>) => {
        const next = { ...prev };
        delete next.page;
        delete next.folder;
        return next;
      }) as never,
      replace: true,
    });
  };

  const changeView = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage blocked: the choice just won't survive a reload.
    }
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

  const actions: FileActions = {
    // `all` lists other members' files for managers: metadata only.
    canDownload: (file) => scope !== 'all' || file.isOwner,
    canShare: (file) => file.isOwner && canWrite,
    canDelete: (file) => (file.isOwner && canWrite) || canManage,
    download: (file) => void download(file),
    share: setSharing,
    remove: setDeleting,
  };

  // Files are paginated server-side; folders aren't, so they lead page 1 only.
  const folderList: ArtifactFolderDto[] =
    showFolders && page === 1 ? (folders.data ?? []) : [];
  const files = data?.data ?? [];
  const total = data?.total ?? 0;
  const loading = isLoading || (showFolders && folders.isLoading);
  const emptyMessage = filter
    ? `No files match "${filter}"`
    : scope === 'shared'
      ? 'Nothing has been shared with you'
      : currentFolderId
        ? 'This folder is empty'
        : 'No files yet';

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const item = row.original;
        if (isFolder(item))
          return (
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 font-medium hover:underline"
              onClick={() => openFolder(item.id)}
            >
              <FolderIcon className="h-4 w-4" />
              <span className="max-w-48 truncate sm:max-w-xs" title={item.name}>
                {item.name}
              </span>
            </button>
          );
        return (
          <div className="flex items-center gap-2 font-medium">
            <FileIcon
              name={item.name}
              mimeType={item.mimeType}
              className="h-4 w-4"
            />
            <span className="max-w-48 truncate sm:max-w-xs" title={item.name}>
              {item.name}
            </span>
            {item.source === 'agent' && (
              <Badge variant="secondary" className="gap-1">
                <Bot className="h-3 w-3" />
                Agent
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'sizeBytes',
      header: 'Size',
      cell: ({ row }) =>
        isFolder(row.original)
          ? '—'
          : row.original.sizeBytes
            ? formatBytes(row.original.sizeBytes)
            : '0 B',
    },
    {
      accessorKey: 'shareType',
      header: 'Access',
      enableSorting: false,
      cell: ({ row }) =>
        isFolder(row.original) ? (
          '—'
        ) : (
          <Badge variant="outline">
            {ACCESS_LABEL[row.original.shareType]}
          </Badge>
        ),
    },
    {
      id: 'owner',
      header: 'Owner',
      enableSorting: false,
      cell: ({ row }) =>
        isFolder(row.original)
          ? '—'
          : row.original.isOwner
            ? 'You'
            : (row.original.createdBy?.name ?? '—'),
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
        if (isFolder(file)) return null;
        return (
          <div
            className="flex justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {actions.canDownload(file) && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Download ${file.name}`}
                onClick={() => actions.download(file)}
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
            {actions.canShare(file) && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Share ${file.name}`}
                onClick={() => actions.share(file)}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            )}
            {actions.canDelete(file) && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Delete ${file.name}`}
                className="text-red-500 hover:text-red-700"
                onClick={() => actions.remove(file)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <StorageUsage usage={usage} />
      <Tabs value={scope} onValueChange={changeScope}>
        <TabsList>
          <TabsTrigger value="mine">My files</TabsTrigger>
          <TabsTrigger value="shared">Shared with me</TabsTrigger>
          {canManage && <TabsTrigger value="all">All files</TabsTrigger>}
        </TabsList>
      </Tabs>

      {/* Only inside a folder: at the root it would just repeat the tab. */}
      {currentFolderId && (
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Up one level"
            title="Up one level"
            onClick={() => openFolder(path.at(-2)?.id ?? null)}
            disabled={path.length === 0}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <FolderBreadcrumb path={path} onNavigate={openFolder} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search files"
            placeholder={inMine ? 'Search in all folders' : 'Search'}
            className="pl-8"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {view === 'grid' && (
            <ButtonGroup>
              <Select
                value={sortBy}
                onValueChange={(value) => setParams({ sortBy: value, page: 1 })}
              >
                <SelectTrigger className="w-32" aria-label="Sort by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                aria-label={
                  sortOrder === 'ASC' ? 'Sort descending' : 'Sort ascending'
                }
                title={sortOrder === 'ASC' ? 'Ascending' : 'Descending'}
                onClick={() =>
                  setParams({
                    sortOrder: sortOrder === 'ASC' ? 'DESC' : 'ASC',
                    page: 1,
                  })
                }
              >
                {sortOrder === 'ASC' ? (
                  <ArrowUpNarrowWide className="h-4 w-4" />
                ) : (
                  <ArrowDownWideNarrow className="h-4 w-4" />
                )}
              </Button>
            </ButtonGroup>
          )}
          <ButtonGroup aria-label="View">
            <Button
              variant={view === 'grid' ? 'secondary' : 'outline'}
              size="icon"
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              title="Grid view"
              onClick={() => changeView('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'list' ? 'secondary' : 'outline'}
              size="icon"
              aria-label="List view"
              aria-pressed={view === 'list'}
              title="List view"
              onClick={() => changeView('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </ButtonGroup>
        </div>
      </div>

      {view === 'grid' ? (
        <>
          <FileGrid
            folders={folderList}
            files={files}
            isLoading={loading}
            emptyMessage={emptyMessage}
            onOpenFolder={openFolder}
            actions={actions}
          />
          {total > pageSize && (
            <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
              <span>
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}{' '}
                of {total}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Next page"
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      ) : (
        // inline-size containment keeps the wide table scrolling inside its own
        // box instead of widening the settings layout on narrow screens.
        <div className="[contain:inline-size]">
          <DataTable
            data={[
              ...folderList.map((f) => ({ ...f, isFolder: true as const })),
              ...files,
            ]}
            columns={columns}
            isLoading={loading}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            totalItems={total}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(column, order) =>
              setParams({ sortBy: column, sortOrder: order })
            }
            emptyMessage={emptyMessage}
          />
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete file"
        description={`Delete "${deleting?.name ?? ''}"? This cannot be undone.`}
        confirmText="Delete"
        disabled={removeFile.isPending}
        onConfirm={() => deleting && removeFile.mutate({ id: deleting.id })}
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
