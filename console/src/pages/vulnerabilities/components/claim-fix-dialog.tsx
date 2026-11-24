import { useT } from '@/lib/i18n-dictionary';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useVulnerabilitiesControllerClaimFix } from '@/services/apis/gen/queries';
import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

/**
 * "Mark fixed": records a fix claim with an optional note. The findings stay
 * open until the next covering scan no longer reports them.
 */
export function ClaimFixDialog({
  vulnerabilityIds,
  trigger,
  onSuccess,
}: {
  vulnerabilityIds: string[];
  trigger: ReactNode;
  onSuccess?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const claimFix = useVulnerabilitiesControllerClaimFix();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setNote('');
  };

  const submit = () => {
    claimFix.mutate(
      {
        data: {
          vulnerabilityIds,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      {
        onSuccess: (res) => {
          toast.success(t('vulnerabilities.claimFix.toastSuccess'), {
            description: t('vulnerabilities.claimFix.toastSuccessDesc', {
              count: String(res?.updated ?? vulnerabilityIds.length),
            }),
          });
          handleOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          toast.error(t('vulnerabilities.claimFix.toastError'), {
            description:
              error instanceof Error ? error.message : t('vulnerabilities.unexpectedError'),
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('vulnerabilities.claimFix.title')}</DialogTitle>
          <DialogDescription>
            {vulnerabilityIds.length > 1
              ? t('vulnerabilities.claimFix.descMany', { n: vulnerabilityIds.length })
              : t('vulnerabilities.claimFix.descOne')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="claim-fix-note">{t('vulnerabilities.claimFix.noteLabel')}</Label>
          <Textarea
            id="claim-fix-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('vulnerabilities.claimFix.notePlaceholder')}
            rows={3}
            className="resize-none"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={claimFix.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={claimFix.isPending}>
            {claimFix.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('vulnerabilities.claimFix.title')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
