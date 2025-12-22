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
import React, { useState, type JSX } from 'react';

interface ConfirmDialogProps {
  title: string;
  description?: string;
  onConfirm: () => void;
  trigger: JSX.Element;
  confirmText?: string;
  disabled?: boolean;
  cancelText?: string;
  typeToConfirm?: string | boolean;
}

export const ConfirmDialog = ({
  title,
  description,
  onConfirm,
  trigger,
  confirmText = 'Confirm',
  disabled = false,
  cancelText = 'Cancel',
  typeToConfirm,
}: ConfirmDialogProps) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const confirmTextRequired =
    typeToConfirm === true
      ? 'yes'
      : typeof typeToConfirm === 'string'
        ? typeToConfirm
        : '';
  const showInput = !!typeToConfirm;

  const handleConfirm = () => {
    onConfirm();
    setOpen(false);
    setInputValue('');
  };

  const handleCancel = () => {
    setOpen(false);
    setInputValue('');
  };

  const isConfirmEnabled = showInput
    ? inputValue === confirmTextRequired
    : !disabled;

  const clonedTrigger = React.cloneElement(trigger, {
    onClick: (e: React.MouseEvent) => {
      e.preventDefault(); // Prevent default to avoid dropdown closing
      e.stopPropagation(); // Prevent bubbling up to parent elements
      setOpen(true);
    },
    onMouseDown: (e: React.MouseEvent) => {
      // Prevent dropdown from auto-closing
      e.preventDefault();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild disabled={disabled}>
        {clonedTrigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {showInput && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Please type "{confirmTextRequired}" to confirm this action.
            </p>
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full"
              autoFocus
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={disabled}>
            {cancelText}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            autoFocus={!showInput}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
