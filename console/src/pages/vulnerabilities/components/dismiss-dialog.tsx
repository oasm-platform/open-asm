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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useVulnerabilitiesControllerBulkDismissVulnerabilities } from '@/services/apis/gen/queries';
import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

/** Available reasons for dismissing a vulnerability */
const DISMISS_REASONS = [
  {
    value: 'false_positive',
    label: 'False positive',
    description: 'This alert is not valid',
  },
  {
    value: 'used_in_test',
    label: 'Used in tests',
    description: 'This alert is not in production code',
  },
  {
    value: 'wont_fix',
    label: "Won't fix",
    description: 'This alert is not relevant',
  },
] as const;

type DismissReason = (typeof DISMISS_REASONS)[number]['value'];

interface DismissAlertDialogProps {
  /** Single vulnerability ID for single dismiss */
  vulnerabilityId?: string;
  /** Multiple vulnerability IDs for bulk dismiss */
  vulnerabilityIds?: string[];
  /** Display name for the vulnerability(s) being dismissed */
  vulnerabilityName?: string;
  /** Trigger element that opens the dialog */
  trigger: ReactNode;
  /** Callback invoked after successful dismissal */
  onDismissSuccess?: () => void;
}

/**
 * Renders a dialog for dismissing vulnerabilities with reason selection and optional comment.
 * Supports both single and bulk dismissal using the bulk dismiss API.
 */
export function DismissAlertDialog({
  vulnerabilityId,
  vulnerabilityIds,
  vulnerabilityName,
  trigger,
  onDismissSuccess,
}: DismissAlertDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DismissReason | ''>('');
  const [comment, setComment] = useState('');

  const bulkDismissMutation =
    useVulnerabilitiesControllerBulkDismissVulnerabilities();

  // Get all IDs to dismiss
  const idsToDismiss =
    vulnerabilityIds ?? (vulnerabilityId ? [vulnerabilityId] : []);
  const isBulkDismiss = idsToDismiss.length > 1;

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setReason('');
      setComment('');
    }
  };

  /**
   * Handles the dismiss action by calling the bulk dismiss API.
   * Shows success/error toast based on the result.
   */
  const handleDismiss = async () => {
    if (!reason || idsToDismiss.length === 0) return;

    bulkDismissMutation.mutate(
      {
        data: {
          ids: idsToDismiss,
          reason,
          comment: comment.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(
            isBulkDismiss ? 'Alerts dismissed' : 'Alert dismissed',
            {
              description: isBulkDismiss
                ? `${idsToDismiss.length} vulnerabilities have been dismissed.`
                : vulnerabilityName
                  ? `"${vulnerabilityName}" has been dismissed.`
                  : 'The vulnerability has been dismissed.',
            },
          );
          setOpen(false);
          setReason('');
          setComment('');
          onDismissSuccess?.();
        },
        onError: (error) => {
          toast.error('Failed to dismiss alert(s)', {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred.',
          });
        },
      },
    );
  };

  const isSubmitDisabled = !reason || bulkDismissMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dismiss alert</DialogTitle>
          <DialogDescription>
            Select a reason to dismiss this alert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reason selection radio group */}
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

          {/* Optional comment field */}
          <div className="space-y-2">
            <Label htmlFor="dismiss-comment">Comment</Label>
            <Textarea
              id="dismiss-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment"
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
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
