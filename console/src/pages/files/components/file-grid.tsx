import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  ArtifactDto,
  ArtifactFolderDto,
} from '@/services/apis/gen/queries';
import { formatBytes } from '@/utils/format-bytes';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Bot, Download, EllipsisVertical, Share2, Trash2 } from 'lucide-react';
import { FileIcon, FolderIcon } from './file-icon';

dayjs.extend(relativeTime);

export interface FileActions {
  canDownload: (file: ArtifactDto) => boolean;
  canShare: (file: ArtifactDto) => boolean;
  canDelete: (file: ArtifactDto) => boolean;
  download: (file: ArtifactDto) => void;
  share: (file: ArtifactDto) => void;
  remove: (file: ArtifactDto) => void;
}

interface FileGridProps {
  folders: ArtifactFolderDto[];
  files: ArtifactDto[];
  isLoading: boolean;
  emptyMessage: string;
  onOpenFolder: (id: string) => void;
  actions: FileActions;
}

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3';

/** Drive-style browser: folder tiles first, then file cards. */
export function FileGrid({
  folders,
  files,
  isLoading,
  emptyMessage,
  onOpenFolder,
  actions,
}: FileGridProps) {
  if (isLoading && folders.length === 0 && files.length === 0)
    return (
      <div className={GRID}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </div>
    );

  if (folders.length === 0 && files.length === 0)
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
        <FolderIcon className="h-10 w-10 opacity-60" />
        {emptyMessage}
      </div>
    );

  return (
    <div className="space-y-6">
      {folders.length > 0 && (
        <section className="space-y-2" aria-label="Folders">
          <h3 className="text-sm font-medium text-muted-foreground">Folders</h3>
          <div className={GRID}>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                title={folder.name}
                onClick={() => onOpenFolder(folder.id)}
                className="flex h-12 min-w-0 items-center gap-3 rounded-lg border bg-card px-3 text-left text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FolderIcon className="h-5 w-5" />
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {files.length > 0 && (
        <section className="space-y-2" aria-label="Files">
          <h3 className="text-sm font-medium text-muted-foreground">Files</h3>
          <div className={GRID}>
            {files.map((file) => (
              <FileCard key={file.id} file={file} actions={actions} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FileCard({
  file,
  actions,
}: {
  file: ArtifactDto;
  actions: FileActions;
}) {
  const canDownload = actions.canDownload(file);
  const canShare = actions.canShare(file);
  const canDelete = actions.canDelete(file);
  const hasActions = canDownload || canShare || canDelete;

  return (
    <div
      className="group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/50"
      // Like opening a file in a file manager; the menu offers the same.
      onDoubleClick={canDownload ? () => actions.download(file) : undefined}
    >
      <div className="relative flex h-24 items-center justify-center bg-muted/50">
        <FileIcon
          name={file.name}
          mimeType={file.mimeType}
          className="h-10 w-10"
        />
        {file.source === 'agent' && (
          <Badge variant="secondary" className="absolute left-2 top-2 gap-1">
            <Bot className="h-3 w-3" />
            Agent
          </Badge>
        )}
      </div>
      <div className="flex min-w-0 items-start gap-1 p-2 pl-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <FileIcon
              name={file.name}
              mimeType={file.mimeType}
              className="h-3.5 w-3.5"
            />
            <span className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {file.sizeBytes ? formatBytes(file.sizeBytes) : '0 B'} ·{' '}
            {dayjs(file.updatedAt).fromNow()}
            {!file.isOwner && file.createdBy?.name
              ? ` · ${file.createdBy.name}`
              : ''}
          </p>
        </div>
        {hasActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={`Actions for ${file.name}`}
              >
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canDownload && (
                <DropdownMenuItem onSelect={() => actions.download(file)}>
                  <Download />
                  Download
                </DropdownMenuItem>
              )}
              {canShare && (
                <DropdownMenuItem onSelect={() => actions.share(file)}>
                  <Share2 />
                  Share
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => actions.remove(file)}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
