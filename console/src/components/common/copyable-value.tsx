import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';

interface CopyableValueProps {
  /** The text to display and copy to clipboard. */
  value: string;
  /** Disable the copy button (visual-only; value is still shown). */
  disabled?: boolean;
  /** Extra action buttons rendered next to the Copy button. */
  children?: ReactNode;
}

/**
 * Displays a value in a bordered box with a copy button below.
 * Mirrors the API key display pattern used in workspace settings.
 */
export function CopyableValue({ value, disabled = false, children }: CopyableValueProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex h-10 items-center justify-center overflow-x-auto rounded border">
        <code>{value}</code>
      </div>
      <div className="flex justify-center gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy} disabled={disabled}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy'}
        </Button>
        {children}
      </div>
    </div>
  );
}
