import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

interface NameDialogProps {
  title: string;
  initialName?: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (name: string) => void;
  onOpenChange: (open: boolean) => void;
}

/** Single-field name prompt shared by "New folder" and the rename actions. */
export function NameDialog({
  title,
  initialName = '',
  submitLabel,
  pending,
  onSubmit,
  onOpenChange,
}: NameDialogProps) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              value={name}
              maxLength={255}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!trimmed || trimmed === initialName || pending}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
