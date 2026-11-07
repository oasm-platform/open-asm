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
          toast.success('Marked as fixed', {
            description: `${res?.updated ?? vulnerabilityIds.length} finding(s) will close once the next covering scan no longer reports them.`,
          });
          handleOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          toast.error('Failed to mark as fixed', {
            description:
              error instanceof Error ? error.message : 'An unexpected error occurred.',
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
          <DialogTitle>Mark fixed</DialogTitle>
          <DialogDescription>
            {vulnerabilityIds.length > 1
              ? `${vulnerabilityIds.length} findings stay open`
              : 'The finding stays open'}{' '}
            until the next scan of the same scope confirms the fix.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="claim-fix-note">What was changed (optional)</Label>
          <Textarea
            id="claim-fix-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Upgraded PHP to 8.3.8"
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
            Cancel
          </Button>
          <Button onClick={submit} disabled={claimFix.isPending}>
            {claimFix.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mark fixed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
