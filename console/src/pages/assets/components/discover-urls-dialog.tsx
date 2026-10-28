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
        title="Discover URLs from public archives"
        onClick={() => setOpen(true)}
      >
        <Link2 className="h-4 w-4" />
        Discover URLs
      </Button>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Discover URLs</DialogTitle>
          <DialogDescription>
            {target
              ? 'Collect historical URLs of this target from the Wayback Machine, Common Crawl, OTX and urlscan.'
              : 'Choose the domain targets to collect historical URLs for. Only targets that finished discovery are listed.'}
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <div className="space-y-2">
            <Label htmlFor="discover-urls-target">Target</Label>
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
            {!target && `${selected.size} selected`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRun}
              disabled={targetIds.length === 0 || isPending}
            >
              {isPending ? 'Starting...' : 'Run'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
