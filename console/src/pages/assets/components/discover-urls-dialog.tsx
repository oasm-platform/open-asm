import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n-dictionary';
import { TargetPicker } from '@/pages/vulnerabilities/components/fast-scan-dialog';
import {
  TargetType,
  useAssetsControllerDiscoverUrls,
} from '@/services/apis/gen/queries';
import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface DiscoverUrlsDialogProps {
  /** Fixed target (target detail page): no picker, the target is pre-filled. */
  target?: { id: string; value: string };
  disabled?: boolean;
}

export function DiscoverUrlsDialog({ target, disabled }: DiscoverUrlsDialogProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { mutate: discover, isPending } = useAssetsControllerDiscoverUrls();

  const targetIds = target ? [target.id] : Array.from(selected);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSelected(new Set());
  };

  const handleRun = () => {
    discover(
      { data: { targetIds } },
      {
        onSuccess: (res) => {
          toast(res.message);
          handleOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        disabled={disabled}
        variant="secondary"
        className="hover:cursor-pointer text-sm h-9 shrink-0"
        title={t('assets.discoverUrls.buttonTitle')}
        onClick={() => setOpen(true)}
      >
        <Link2 className="h-4 w-4" />
        {t('assets.discoverUrls.title')}
      </Button>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{t('assets.discoverUrls.title')}</DialogTitle>
          <DialogDescription>
            {target
              ? t('assets.discoverUrls.descriptionTarget')
              : t('assets.discoverUrls.descriptionPick')}
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <div className="space-y-2">
            <Label htmlFor="discover-urls-target">{t('assets.discoverUrls.target')}</Label>
            <Input id="discover-urls-target" value={target.value} readOnly />
          </div>
        ) : (
          <TargetPicker
            selected={selected}
            onSelectedChange={setSelected}
            type={TargetType.DOMAIN}
          />
        )}
        <DialogFooter className="items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {!target && t('assets.discoverUrls.selected', { count: selected.size })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRun}
              disabled={targetIds.length === 0 || isPending}
            >
              {isPending ? t('assets.discoverUrls.starting') : t('assets.discoverUrls.run')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
