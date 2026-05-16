import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import SettingMenu from '@/pages/agents/settings/setting-menu';

interface AgentSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'llm' | 'mcp' | 'skill';
}

export function AgentSettingsDialog({
  open,
  onOpenChange,
  defaultTab = 'llm',
}: AgentSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-full h-[80vh] p-0 overflow-hidden sm:rounded-xl border shadow-lg bg-background">
        <DialogTitle className="sr-only">Agent Settings</DialogTitle>
        <SettingMenu defaultTab={defaultTab} />
      </DialogContent>
    </Dialog>
  );
}
