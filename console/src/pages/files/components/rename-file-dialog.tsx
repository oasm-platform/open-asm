import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { handleServerError } from '@/lib/handle-server-error';
import {
  useArtifactsControllerUpdate,
  type ArtifactDto,
} from '@/services/apis/gen/queries';
import { useState } from 'react';
import { toast } from 'sonner';

interface RenameFileDialogProps {
  file: ArtifactDto;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function RenameFileDialog({
  file,
  onOpenChange,
  onChanged,
}: RenameFileDialogProps) {
  const [name, setName] = useState(file.name);
  const update = useArtifactsControllerUpdate({
    mutation: {
      onSuccess: () => {
        toast.success('File renamed');
        onChanged();
        onOpenChange(false);
      },
      onError: handleServerError,
    },
  });
  const trimmed = name.trim();

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ id: file.id, data: { name: trimmed } });
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="file-name">Name</Label>
            <Input
              id="file-name"
              value={name}
              maxLength={255}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!trimmed || trimmed === file.name || update.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
