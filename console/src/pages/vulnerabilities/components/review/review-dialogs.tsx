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
  error instanceof Error ? error.message : 'An unexpected error occurred.';

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
          toast.success('Proposal approved', {
            description: 'It is now a new finding in the list.',
          });
          setOpen(false);
          onDone?.();
        },
        onError: (error) => toast.error('Failed to approve', { description: errorText(error) }),
      },
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve proposal</DialogTitle>
          <DialogDescription>
            The finding joins the list as New and its SLA starts now.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="approve-severity">Severity</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id="approve-severity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="capitalize">{s}</span>
                    {s === severity && (
                      <span className="text-xs text-muted-foreground"> (proposed)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="approve-note">Note (optional)</Label>
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
            Cancel
          </Button>
          <Button onClick={submit} disabled={approve.isPending}>
            {approve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve
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
          toast.success('Proposal rejected');
          setOpen(false);
          onDone?.();
        },
        onError: (error) => toast.error('Failed to reject', { description: errorText(error) }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject proposal</DialogTitle>
          <DialogDescription>
            The rejected record is kept so the agent does not propose the same finding again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-note">Reason</Label>
          <Textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="resize-none"
            placeholder="Why this is not a real finding"
            aria-invalid={touched && missing}
          />
          {touched && missing && (
            <p className="text-sm text-destructive" role="alert">
              A reason is required.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={reject.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={reject.isPending}>
            {reject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reject
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
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const approve = useVulnerabilitiesControllerBulkApproveProposals();
  const reject = useVulnerabilitiesControllerBulkRejectProposals();
  const isReject = action === 'reject';
  const isPending = approve.isPending || reject.isPending;
  const missing = isReject && !note.trim();
  const count = `${ids.length} proposal${ids.length === 1 ? '' : 's'}`;

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
    const verb = isReject ? 'rejected' : 'approved';
    const message = `${done} proposal${done === 1 ? '' : 's'} ${verb}`;
    const description = skipped
      ? `${skipped} skipped: ${res.skipped[0].reason}${skipped > 1 ? ' (and others)' : ''}`
      : isReject
        ? undefined
        : 'They are now new findings in the list.';
    if (done === 0) toast.warning(message, { description });
    else toast.success(message, { description });
    setOpen(false);
    onDone?.();
  };
  const onError = (error: unknown) =>
    toast.error(`Failed to ${action}`, { description: errorText(error) });

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
            {isReject ? 'Reject' : 'Approve'} {count}
          </DialogTitle>
          <DialogDescription>
            {isReject
              ? 'The rejected records are kept so the agent does not propose the same findings again.'
              : 'Each finding joins the list as New with its proposed severity, and its SLA starts now.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="bulk-review-note">
            {isReject ? 'Reason' : 'Note (optional)'}
          </Label>
          <Textarea
            id="bulk-review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="resize-none"
            placeholder={isReject ? 'Why these are not real findings' : undefined}
            aria-invalid={touched && missing}
          />
          {touched && missing && (
            <p className="text-sm text-destructive" role="alert">
              A reason is required.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={isReject ? 'destructive' : 'default'}
            onClick={submit}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReject ? 'Reject' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Merges the proposal into an approved finding and opens that finding. */
export function useMergeProposal(id: string, onDone?: () => void) {
  const navigate = useNavigate();
  const merge = useVulnerabilitiesControllerMergeProposal();
  const run = (targetVulnerabilityId: string) =>
    merge.mutate(
      { id, data: { targetVulnerabilityId } },
      {
        onSuccess: (res) => {
          toast.success('Proposal merged', {
            description: `${res?.movedSources ?? 0} source(s) moved to the existing finding.`,
          });
          onDone?.();
          navigate({
            to: '/vulnerabilities/$id',
            params: { id: res?.targetVulnerabilityId ?? targetVulnerabilityId },
          });
        },
        onError: (error) => toast.error('Failed to merge', { description: errorText(error) }),
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
          <DialogTitle>Merge into an existing finding</DialogTitle>
          <DialogDescription>
            The agent's evidence and tools become sources of that finding; the proposal is deleted.
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
                Another finding (id)
              </Label>
              <Input
                id="merge-other-id"
                value={otherId}
                placeholder="Vulnerability id"
                onFocus={() => setChoice(OTHER)}
                onChange={(e) => setOtherId(e.target.value)}
              />
            </div>
          </div>
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => merge(targetId)} disabled={!valid || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
