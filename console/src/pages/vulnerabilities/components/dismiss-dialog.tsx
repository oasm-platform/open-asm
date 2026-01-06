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
import {
  useVulnerabilitiesControllerDismissVulnerability,
  type VulnerabilityDismissal,
} from '@/services/apis/gen/queries';
import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

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
  vulnerabilityName?: string;
  trigger: ReactNode;
  onDismissSuccess?: () => void;
}

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
  const [isProcessing, setIsProcessing] = useState(false);

  const dismissMutation = useVulnerabilitiesControllerDismissVulnerability();

  // Get all IDs to dismiss
  const idsToDissmiss =
    vulnerabilityIds ?? (vulnerabilityId ? [vulnerabilityId] : []);
  const isBulkDismiss = idsToDissmiss.length > 1;

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setReason('');
      setComment('');
    }
  };

  const handleDismiss = async () => {
    if (!reason || idsToDissmiss.length === 0) return;

    setIsProcessing(true);

    try {
      // Dismiss all selected vulnerabilities sequentially
      for (const id of idsToDissmiss) {
        const dismissalData: VulnerabilityDismissal = {
          vulnerabilityId: id,
          userId: '',
          reason,
          comment: comment.trim(),
        };

        await new Promise<void>((resolve, reject) => {
          dismissMutation.mutate(
            { id, data: dismissalData },
            {
              onSuccess: () => resolve(),
              onError: (error) => reject(error),
            },
          );
        });
      }

      toast.success(isBulkDismiss ? 'Alerts dismissed' : 'Alert dismissed', {
        description: isBulkDismiss
          ? `${idsToDissmiss.length} vulnerabilities have been dismissed.`
          : vulnerabilityName
            ? `"${vulnerabilityName}" has been dismissed.`
            : 'The vulnerability has been dismissed.',
      });
      setOpen(false);
      setReason('');
      setComment('');
      onDismissSuccess?.();
    } catch (error) {
      toast.error('Failed to dismiss alert(s)', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const isSubmitDisabled = !reason || isProcessing;

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
            disabled={dismissMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleDismiss} disabled={isSubmitDisabled}>
            {dismissMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
