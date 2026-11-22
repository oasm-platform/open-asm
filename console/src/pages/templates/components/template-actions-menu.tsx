import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { handleServerError } from '@/lib/handle-server-error';
import { ShareFileDialog } from '@/pages/files/components/share-file-dialog';
import {
  artifactsControllerDownload,
  getTemplatesControllerGetManyQueryKey,
  useArtifactsControllerRemove,
  useTemplatesControllerRename,
  type ArtifactDto,
} from '@/services/apis/gen/queries';
import { useTemplateTabs } from '../hooks/use-template-tabs';
import { useT } from '@/lib/i18n-dictionary';

const NAME_PATTERN = /\.ya?ml$/i;

type Props = {
  /** The saved template; omit for a tab that was never saved. */
  file?: ArtifactDto;
  /** The menu button, rendered with asChild. */
  trigger: ReactNode;
  /** Items shown above the file actions, e.g. Format/Save on narrow screens. */
  children?: ReactNode;
  side?: 'right' | 'bottom';
  align?: 'start' | 'end';
};

/** Rename, share, download and delete for one template, with their dialogs. */
export function TemplateActionsMenu({ file, trigger, children, side, align }: Props) {
  const t = useT();
  const { hasPermission } = usePermission();
  const queryClient = useQueryClient();
  const { tabs, rename: renameTab, close } = useTemplateTabs();
  const manage = !!file?.isOwner && hasPermission('artifact.write');
  const [dialog, setDialog] = useState<'rename' | 'delete' | 'share' | null>(null);

  const remove = useArtifactsControllerRemove({ mutation: { onError: () => {} } });
  const rename = useTemplatesControllerRename({ mutation: { onError: () => {} } });
  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: getTemplatesControllerGetManyQueryKey(),
    });

  const download = async (id: string) => {
    try {
      const { url } = await artifactsControllerDownload(id);
      window.location.assign(url);
    } catch (error) {
      handleServerError(error);
    }
  };

  if (!file && !children) return null;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent side={side} align={align}>
          {children}
          {children && file && <DropdownMenuSeparator />}
          {file && manage && (
            <>
              <DropdownMenuItem onSelect={() => setDialog('rename')}>
                {t('templates.actions.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('share')}>
                {t('templates.actions.share')}
              </DropdownMenuItem>
            </>
          )}
          {file && (
            <DropdownMenuItem onSelect={() => void download(file.id)}>
              {t('common.download')}
            </DropdownMenuItem>
          )}
          {file && manage && (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
              {t('common.delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {file && dialog === 'rename' && (
        <RenameDialog
          file={file}
          pending={rename.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(name) =>
            rename.mutate(
              { id: file.id, data: { name } },
              {
                onSuccess: () => {
                  toast.success(t('templates.actions.renamed'));
                  renameTab(file.id, name);
                  setDialog(null);
                  refresh();
                },
                onError: handleServerError,
              },
            )
          }
        />
      )}
      {file && dialog === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('templates.actions.deleteTitle')}
          description={t('templates.actions.deleteConfirm', { name: file.name })}
          confirmText={t('common.delete')}
          onConfirm={() =>
            remove.mutate(
              { id: file.id },
              {
                onSuccess: () => {
                  toast.success(t('templates.actions.deleted'));
                  tabs.filter((tab) => tab.artifactId === file.id).forEach((tab) => close(tab.id));
                  refresh();
                },
                onError: handleServerError,
              },
            )
          }
        />
      )}
      {file && dialog === 'share' && (
        <ShareFileDialog
          file={file}
          onOpenChange={(o) => !o && setDialog(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function RenameDialog({
  file,
  pending,
  onClose,
  onSubmit,
}: {
  file: ArtifactDto;
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState(file.name);
  const [error, setError] = useState<string>();

  const submit = () => {
    const trimmed = name.trim();
    if (!NAME_PATTERN.test(trimmed)) {
      setError(t('templates.actions.nameExtension'));
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('templates.actions.renameTitle')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid gap-2"
        >
          <Label htmlFor="template-name">{t('templates.actions.templateName')}</Label>
          <Input
            id="template-name"
            value={name}
            aria-invalid={!!error}
            onChange={(e) => {
              setName(e.target.value);
              setError(undefined);
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {t('templates.actions.rename')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
