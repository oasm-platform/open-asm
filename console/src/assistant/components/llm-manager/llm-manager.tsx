import { Dialog, DialogContent } from '@/components/ui/dialog';
import { LLMManagerContent } from './llm-manager-content';

interface LLMManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LLMManager({ open, onOpenChange }: LLMManagerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border shadow-lg">
        <LLMManagerContent />
      </DialogContent>
    </Dialog>
  );
}
