import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Folder } from 'lucide-react';
import { useState } from 'react';
import { FolderBreadcrumb } from './folder-breadcrumb';
import { useFolderPath, useFolders } from './use-folders';

interface MoveDialogProps {
  title: string;
  /** Where the item is now; "Move here" is disabled there. */
  currentParentId: string | null;
  /** The folder being moved: hidden so it cannot be moved into itself. */
  excludeFolderId?: string;
  pending: boolean;
  onMove: (folderId: string | null) => void;
  onOpenChange: (open: boolean) => void;
}

/** Folder picker: browse your folder tree and move the item to the open one. */
export function MoveDialog({
  title,
  currentParentId,
  excludeFolderId,
  pending,
  onMove,
  onOpenChange,
}: MoveDialogProps) {
  const [browseId, setBrowseId] = useState<string | null>(null);
  const folders = useFolders(browseId);
  const path = useFolderPath(browseId);
  const visible = (folders.data ?? []).filter((f) => f.id !== excludeFolderId);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <FolderBreadcrumb path={path} onNavigate={setBrowseId} />
        <div className="max-h-64 min-h-24 overflow-y-auto rounded-md border">
          {visible.length ? (
            <ul className="divide-y">
              {visible.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                    onClick={() => setBrowseId(folder.id)}
                  >
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {folders.isLoading ? 'Loading…' : 'No subfolders'}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || browseId === currentParentId}
            onClick={() => onMove(browseId)}
          >
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
