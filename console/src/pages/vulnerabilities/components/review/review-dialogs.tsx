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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SeverityBadge } from '@/components/vulnerabilities/lifecycle-badges';
import { t as tPlain, useT } from '@/lib/i18n-dictionary';
import {
  Severity,
  useVulnerabilitiesControllerApproveProposal,
  useVulnerabilitiesControllerBulkApproveProposals,
  useVulnerabilitiesControllerBulkRejectProposals,
  useVulnerabilitiesControllerMergeProposal,
  useVulnerabilitiesControllerRejectProposal,
  type BulkReviewResultDto,
  type VulnerabilityDuplicateDto,
} from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

const SEVERITIES = [
  Severity.critical,
  Severity.high,
  Severity.medium,
  Severity.low,
  Severity.info,
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : tPlain('vulnerabilities.unexpectedError');

/** Approve: optional severity override and note. */
export function ApproveDialog({
  id,
  severity,
  trigger,
  onDone,
}: {
  id: string;
  severity: string;
  trigger: ReactNode;
  onDone?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(severity);
  const [note, setNote] = useState('');
  const approve = useVulnerabilitiesControllerApproveProposal();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setValue(severity);
      setNote('');
    }
  };

  const submit = () =>
    approve.mutate(
      {
        id,
        data: {
          ...(value !== severity ? { severity: value as Severity } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(t('vulnerabilities.review.approvedToast'), {
            description: t('vulnerabilities.review.approvedDesc'),
          });
          setOpen(false);
          onDone?.();
        },
        onError: (error) => toast.error(t('vulnerabilities.review.failedApprove'), {
            description: errorText(error),
          }),
      },
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('vulnerabilities.review.approveTitle')}</DialogTitle>
          <DialogDescription>
            {t('vulnerabilities.review.approveDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="approve-severity">
              {t('vulnerabilities.review.severity')}
            </Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id="approve-severity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="capitalize">{t(`vulnerabilities.severity.${s}`)}</span>
                    {s === severity && (
                      <span className="text-xs text-muted-foreground">
                        {t('vulnerabilities.review.proposed')}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="approve-note">
              {t('vulnerabilities.review.noteOptional')}
            </Label>
            <Textarea
              id="approve-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={approve.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={approve.isPending}>
            {approve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('vulnerabilities.review.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reject: a reason is required. */
export function RejectDialog({
  id,
  trigger,
  onDone,
}: {
  id: string;
  trigger: ReactNode;
  onDone?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const reject = useVulnerabilitiesControllerRejectProposal();
  const missing = !note.trim();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setNote('');
      setTouched(false);
    }
  };

  const submit = () => {
    setTouched(true);
    if (missing) return;
    reject.mutate(
      { id, data: { note: note.trim() } },
      {
        onSuccess: () => {
          toast.success(t('vulnerabilities.review.rejectedToast'));
          setOpen(false);
          onDone?.();
        },
        onError: (error) => toast.error(t('vulnerabilities.review.failedReject'), {
            description: errorText(error),
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('vulnerabilities.review.rejectTitle')}</DialogTitle>
          <DialogDescription>
            {t('vulnerabilities.review.rejectDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-note">{t('vulnerabilities.review.reason')}</Label>
          <Textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="resize-none"
            placeholder={t('vulnerabilities.review.rejectPlaceholder')}
            aria-invalid={touched && missing}
          />
          {touched && missing && (
            <p className="text-sm text-destructive" role="alert">
              {t('vulnerabilities.review.reasonRequired')}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={reject.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={reject.isPending}>
            {reject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('vulnerabilities.review.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Approve or reject several pending proposals at once. Approve keeps each
 * proposed severity; reject needs one reason for all of them.
 */
export function BulkReviewDialog({
  action,
  ids,
  trigger,
  onDone,
}: {
  action: 'approve' | 'reject';
  ids: string[];
  trigger: ReactNode;
  onDone?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const approve = useVulnerabilitiesControllerBulkApproveProposals();
  const reject = useVulnerabilitiesControllerBulkRejectProposals();
  const isReject = action === 'reject';
  const isPending = approve.isPending || reject.isPending;
  const missing = isReject && !note.trim();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setNote('');
      setTouched(false);
    }
  };

  const onSuccess = (res: BulkReviewResultDto) => {
    const done = res.reviewed.length;
    const skipped = res.skipped.length;
    const message = isReject
      ? t('vulnerabilities.review.bulkRejected', { count: done })
      : t('vulnerabilities.review.bulkApproved', { count: done });
    const description = skipped
      ? `${t('vulnerabilities.review.skipped', { n: skipped, reason: res.skipped[0].reason })}${skipped > 1 ? t('vulnerabilities.review.andOthers') : ''}`
      : isReject
        ? undefined
        : t('vulnerabilities.review.bulkApprovedDesc');
    if (done === 0) toast.warning(message, { description });
    else toast.success(message, { description });
    setOpen(false);
    onDone?.();
  };
  const onError = (error: unknown) =>
    toast.error(
      isReject
        ? t('vulnerabilities.review.failedReject')
        : t('vulnerabilities.review.failedApprove'),
      { description: errorText(error) },
    );

  const submit = () => {
    setTouched(true);
    if (missing) return;
    const trimmed = note.trim();
    if (isReject) {
      reject.mutate({ data: { ids, note: trimmed } }, { onSuccess, onError });
    } else {
      approve.mutate(
        { data: { ids, ...(trimmed ? { note: trimmed } : {}) } },
        { onSuccess, onError },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isReject
              ? t('vulnerabilities.review.bulkReject', { count: ids.length })
              : t('vulnerabilities.review.bulkApprove', { count: ids.length })}
          </DialogTitle>
          <DialogDescription>
            {isReject
              ? t('vulnerabilities.review.bulkRejectDesc')
              : t('vulnerabilities.review.bulkApproveDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="bulk-review-note">
            {isReject
              ? t('vulnerabilities.review.reason')
              : t('vulnerabilities.review.noteOptional')}
          </Label>
          <Textarea
            id="bulk-review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="resize-none"
            placeholder={
              isReject ? t('vulnerabilities.review.bulkRejectPlaceholder') : undefined
            }
            aria-invalid={touched && missing}
          />
          {touched && missing && (
            <p className="text-sm text-destructive" role="alert">
              {t('vulnerabilities.review.reasonRequired')}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={isReject ? 'destructive' : 'default'}
            onClick={submit}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReject
              ? t('vulnerabilities.review.reject')
              : t('vulnerabilities.review.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Merges the proposal into an approved finding and opens that finding. */
export function useMergeProposal(id: string, onDone?: () => void) {
  const t = useT();
  const navigate = useNavigate();
  const merge = useVulnerabilitiesControllerMergeProposal();
  const run = (targetVulnerabilityId: string) =>
    merge.mutate(
      { id, data: { targetVulnerabilityId } },
      {
        onSuccess: (res) => {
          toast.success(t('vulnerabilities.review.mergedToast'), {
            description: t('vulnerabilities.review.mergedDesc', {
              n: res?.movedSources ?? 0,
            }),
          });
          onDone?.();
          navigate({
            to: '/vulnerabilities/$id',
            params: { id: res?.targetVulnerabilityId ?? targetVulnerabilityId },
          });
        },
        onError: (error) => toast.error(t('vulnerabilities.review.failedMerge'), {
            description: errorText(error),
          }),
      },
    );
  return { merge: run, isPending: merge.isPending };
}

const OTHER = 'other';

/** "Merge into…": a suggested duplicate, or any approved finding by id. */
export function MergeDialog({
  id,
  duplicates,
  trigger,
  onDone,
}: {
  id: string;
  duplicates: VulnerabilityDuplicateDto[];
  trigger: ReactNode;
  onDone?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');
  const [otherId, setOtherId] = useState('');
  const { merge, isPending } = useMergeProposal(id, onDone);

  const targetId = choice === OTHER ? otherId.trim() : choice;
  const valid = !!targetId && UUID.test(targetId);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setChoice(duplicates[0]?.id ?? OTHER);
      setOtherId('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('vulnerabilities.review.mergeTitle')}</DialogTitle>
          <DialogDescription>
            {t('vulnerabilities.review.mergeDesc')}
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={choice} onValueChange={setChoice} className="space-y-2">
          {duplicates.map((d) => (
            <div key={d.id} className="flex items-start gap-3">
              <RadioGroupItem value={d.id} id={`merge-${d.id}`} className="mt-1" />
              <Label htmlFor={`merge-${d.id}`} className="flex flex-1 flex-col items-start gap-1 font-normal">
                <span className="flex items-center gap-2">
                  <SeverityBadge severity={d.severity} />
                  <span className="font-medium">{d.name}</span>
                </span>
                {d.affectedUrl && (
                  <span className="text-xs text-muted-foreground break-all">{d.affectedUrl}</span>
                )}
              </Label>
            </div>
          ))}
          <div className="flex items-start gap-3">
            <RadioGroupItem value={OTHER} id="merge-other" className="mt-2.5" />
            <div className="flex-1 space-y-1">
              <Label htmlFor="merge-other-id" className="font-normal">
                {t('vulnerabilities.review.anotherFinding')}
              </Label>
              <Input
                id="merge-other-id"
                value={otherId}
                placeholder={t('vulnerabilities.review.vulnId')}
                onFocus={() => setChoice(OTHER)}
                onChange={(e) => setOtherId(e.target.value)}
              />
            </div>
          </div>
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => merge(targetId)} disabled={!valid || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('vulnerabilities.review.merge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
