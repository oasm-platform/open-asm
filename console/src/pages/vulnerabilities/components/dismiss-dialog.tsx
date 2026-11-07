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
import { Textarea } from '@/components/ui/textarea';
import {
  DismissReason,
  useVulnerabilitiesControllerBulkDismissVulnerabilities,
  useVulnerabilitiesControllerGetSettings,
} from '@/services/apis/gen/queries';
import { addDays, format, parse, startOfDay } from 'date-fns';
import {
  DATE_FORMAT,
  DEFAULT_RISK_ACCEPT_MAX_DAYS,
  validateRiskExpiry,
} from '../risk-expiry';
import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

/** Available reasons for dismissing a vulnerability */
const DISMISS_REASONS = [
  {
    value: DismissReason.false_positive,
    label: 'False positive',
    description: 'This alert is not valid',
  },
  {
    value: DismissReason.used_in_test,
    label: 'Used in tests',
    description: 'This alert is not in production code',
  },
  {
    value: DismissReason.wont_fix,
    label: "Won't fix",
    description: 'This alert is not relevant',
  },
  {
    value: DismissReason.risk_accepted,
    label: 'Risk accepted',
    description: 'Accepted until a date; the finding reopens afterwards',
  },
] as const;

interface DismissAlertDialogProps {
  /** Vulnerability ids to dismiss */
  vulnerabilityIds: string[];
  /** Display name for the vulnerability(s) being dismissed */
  vulnerabilityName?: string;
  /** Trigger element that opens the dialog */
  trigger: ReactNode;
  /** Callback invoked after successful dismissal */
  onDismissSuccess?: () => void;
  /** 'accept-risk' opens with risk accepted chosen and titles the dialog for it. */
  mode?: 'dismiss' | 'accept-risk';
}

/**
 * Dialog for dismissing vulnerabilities: a reason, an optional comment and,
 * for a risk acceptance, the date it ends (at most riskAcceptMaxDays ahead).
 */
export function DismissAlertDialog({
  vulnerabilityIds,
  vulnerabilityName,
  trigger,
  onDismissSuccess,
  mode = 'dismiss',
}: DismissAlertDialogProps) {
  const initialReason: DismissReason | '' =
    mode === 'accept-risk' ? DismissReason.risk_accepted : '';
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DismissReason | ''>(initialReason);
  const [comment, setComment] = useState('');
  const [expiry, setExpiry] = useState('');
  const [touched, setTouched] = useState(false);

  const { data: settings } = useVulnerabilitiesControllerGetSettings({
    query: { enabled: open },
  });
  const maxDays = settings?.riskAcceptMaxDays ?? DEFAULT_RISK_ACCEPT_MAX_DAYS;

  const bulkDismissMutation =
    useVulnerabilitiesControllerBulkDismissVulnerabilities();

  const isBulk = vulnerabilityIds.length > 1;
  const isRisk = reason === DismissReason.risk_accepted;
  const expiryError = isRisk ? validateRiskExpiry(expiry, maxDays) : null;

  const reset = () => {
    setReason(initialReason);
    setComment('');
    setExpiry('');
    setTouched(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) reset();
  };

  const handleDismiss = () => {
    setTouched(true);
    if (!reason || vulnerabilityIds.length === 0 || expiryError) return;

    bulkDismissMutation.mutate(
      {
        data: {
          ids: vulnerabilityIds,
          reason,
          comment: comment.trim() || undefined,
          ...(isRisk
            ? {
                expiresAt: startOfDay(
                  parse(expiry, DATE_FORMAT, new Date()),
                ).toISOString(),
              }
            : {}),
        },
      },
      {
        onSuccess: () => {
          const what = isBulk
            ? `${vulnerabilityIds.length} vulnerabilities`
            : vulnerabilityName
              ? `"${vulnerabilityName}"`
              : 'The vulnerability';
          toast.success(isRisk ? 'Risk accepted' : 'Dismissed', {
            description: isRisk
              ? `${what} accepted until ${expiry}.`
              : `${what} dismissed.`,
          });
          setOpen(false);
          reset();
          onDismissSuccess?.();
        },
        onError: (error) => {
          toast.error('Failed to dismiss', {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred.',
          });
        },
      },
    );
  };

  const today = new Date();
  const isSubmitDisabled = !reason || bulkDismissMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'accept-risk' ? 'Accept risk' : 'Dismiss'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'accept-risk'
              ? `Accept the risk until a date, at most ${maxDays} days ahead. The finding reopens afterwards and its SLA is paused meanwhile.`
              : 'Select a reason to dismiss.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {mode === 'dismiss' && (
            <RadioGroup
              value={reason}
              onValueChange={(value) => setReason(value as DismissReason)}
              className="space-y-3"
            >
              {DISMISS_REASONS.map((option) => (
                <div key={option.value} className="flex items-start space-x-3">
                  <RadioGroupItem
                    value={option.value}
                    id={`reason-${option.value}`}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5">
                    <Label
                      htmlFor={`reason-${option.value}`}
                      className="cursor-pointer font-medium"
                    >
                      {option.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          )}

          {isRisk && (
            <div className="space-y-2">
              <Label htmlFor="risk-expiry">Accepted until</Label>
              <Input
                id="risk-expiry"
                type="date"
                value={expiry}
                min={format(addDays(today, 1), DATE_FORMAT)}
                max={format(addDays(today, maxDays), DATE_FORMAT)}
                onChange={(e) => setExpiry(e.target.value)}
                aria-invalid={touched && !!expiryError}
              />
              {touched && expiryError ? (
                <p className="text-sm text-destructive" role="alert">
                  {expiryError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  At most {maxDays} days from today.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="dismiss-comment">Comment</Label>
            <Textarea
              id="dismiss-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                isRisk ? 'Why the risk is acceptable' : 'Add a comment'
              }
              className="resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={bulkDismissMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleDismiss} disabled={isSubmitDisabled}>
            {bulkDismissMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isRisk ? 'Accept risk' : 'Dismiss'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
