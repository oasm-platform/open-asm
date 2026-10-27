import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { handleServerError } from '@/lib/handle-server-error';
import {
  useArtifactsControllerAddShares,
  useArtifactsControllerGetShares,
  useArtifactsControllerRemoveShare,
  useArtifactsControllerUpdate,
  type ArtifactDto,
  type UpdateArtifactDtoShareType,
} from '@/services/apis/gen/queries';
import { Copy, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const ACCESS_OPTIONS: { value: UpdateArtifactDtoShareType; label: string }[] = [
  { value: 'private', label: 'Private — only you' },
  { value: 'shared', label: 'Shared — you and the people below' },
  { value: 'public', label: 'Public — anyone with the link' },
];

interface ShareFileDialogProps {
  file: ArtifactDto;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function ShareFileDialog({
  file,
  onOpenChange,
  onChanged,
}: ShareFileDialogProps) {
  const [access, setAccess] = useState(file.shareType);
  const [emails, setEmails] = useState('');
  const shares = useArtifactsControllerGetShares(file.id);
  const publicUrl = `${window.location.origin}/api/public/artifacts/${file.id}`;

  const update = useArtifactsControllerUpdate({
    mutation: { onError: handleServerError },
  });
  const addShares = useArtifactsControllerAddShares({
    mutation: { onError: handleServerError },
  });
  const removeShare = useArtifactsControllerRemoveShare({
    mutation: {
      onSuccess: () => void shares.refetch(),
      onError: handleServerError,
    },
  });

  const changeAccess = async (shareType: UpdateArtifactDtoShareType) => {
    await update.mutateAsync({ id: file.id, data: { shareType } });
    setAccess(shareType);
    onChanged();
  };

  const share = async () => {
    const list = emails.split(/[\s,;]+/).filter(Boolean);
    if (!list.length) return;
    const result = await addShares.mutateAsync({
      id: file.id,
      data: { emails: list },
    });
    setEmails('');
    void shares.refetch();
    if (result.skipped) {
      toast.warning(
        `${result.skipped} email(s) skipped: not a member of this workspace`,
      );
    }
    if (result.shared) {
      toast.success(`Shared with ${result.shared} member(s)`);
      // Adding people to a private file only takes effect once it is shared.
      if (access === 'private') await changeAccess('shared');
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{file.name}”</DialogTitle>
          <DialogDescription>
            Only members of this workspace can be added. Use a public link for
            anyone else.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="file-access">General access</Label>
          <Select
            value={access}
            onValueChange={(v) =>
              void changeAccess(v as UpdateArtifactDtoShareType).catch(() => {})
            }
            disabled={update.isPending}
          >
            <SelectTrigger id="file-access" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {access === 'public' && (
          <div className="flex gap-2">
            <Input readOnly value={publicUrl} aria-label="Public link" />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy public link"
              onClick={() =>
                void navigator.clipboard
                  .writeText(publicUrl)
                  .then(() => toast.success('Link copied'))
              }
            >
              <Copy />
            </Button>
          </div>
        )}

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void share().catch(() => {});
          }}
        >
          <Label htmlFor="share-emails">Add people</Label>
          <div className="flex gap-2">
            <Input
              id="share-emails"
              placeholder="alice@example.com, bob@example.com"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
            />
            <Button type="submit" disabled={!emails.trim() || addShares.isPending}>
              Share
            </Button>
          </div>
        </form>

        <div className="space-y-1">
          <p className="text-sm font-medium">People with access</p>
          {shares.data?.length ? (
            <ul className="divide-y rounded-md border">
              {shares.data.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{user.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${user.name}`}
                    disabled={removeShare.isPending}
                    onClick={() =>
                      removeShare.mutate({ id: file.id, userId: user.id })
                    }
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {shares.isLoading ? 'Loading…' : 'Not shared with anyone yet.'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
