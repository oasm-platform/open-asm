import { useT } from '@/lib/i18n-dictionary';
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
} from '@/services/apis/gen/queries';
import { Copy, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type ShareType = ArtifactDto['shareType'];

const ACCESS_OPTIONS: { value: ShareType; labelKey: string }[] = [
  { value: 'private', labelKey: 'files.share.private' },
  { value: 'shared', labelKey: 'files.share.shared' },
  { value: 'public', labelKey: 'files.share.public' },
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
  const t = useT();
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

  const changeAccess = async (shareType: ShareType) => {
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
        t('files.share.skipped', { count: result.skipped }),
      );
    }
    if (result.shared) {
      toast.success(t('files.share.sharedWith', { count: result.shared }));
      // Adding people to a private file only takes effect once it is shared.
      if (access === 'private') await changeAccess('shared');
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('files.share.title', { name: file.name })}</DialogTitle>
          <DialogDescription>
            {t('files.share.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="file-access">{t('files.share.generalAccess')}</Label>
          <Select
            value={access}
            onValueChange={(v) =>
              void changeAccess(v as ShareType).catch(() => {})
            }
            disabled={update.isPending}
          >
            <SelectTrigger id="file-access" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {access === 'public' && (
          <div className="flex gap-2">
            <Input readOnly value={publicUrl} aria-label={t('files.share.publicLink')} />
            <Button
              variant="outline"
              size="icon"
              aria-label={t('files.share.copyPublicLink')}
              onClick={() =>
                void navigator.clipboard
                  .writeText(publicUrl)
                  .then(() => toast.success(t('files.share.linkCopied')))
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
          <Label htmlFor="share-emails">{t('files.share.addPeople')}</Label>
          <div className="flex gap-2">
            <Input
              id="share-emails"
              placeholder={t('files.share.emailsPlaceholder')}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
            />
            <Button type="submit" disabled={!emails.trim() || addShares.isPending}>
              {t('files.share.share')}
            </Button>
          </div>
        </form>

        <div className="space-y-1">
          <p className="text-sm font-medium">{t('files.share.peopleWithAccess')}</p>
          {shares.data?.length ? (
            <ul className="divide-y rounded-md border dark:bg-card-surface">
              {shares.data.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{user.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('files.share.remove', { name: user.name })}
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
              {shares.isLoading ? t('files.share.loading') : t('files.share.notShared')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
