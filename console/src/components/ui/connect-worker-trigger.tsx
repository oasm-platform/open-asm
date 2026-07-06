import { Button } from '@/components/ui/button';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { SquareTerminal } from 'lucide-react';
import type { ReactNode } from 'react';

interface ConnectWorkerTriggerProps {
  networkId?: string;
  children?: ReactNode;
}

export function ConnectWorkerTrigger({
  networkId,
  children,
}: ConnectWorkerTriggerProps) {
  const { openDialog } = useConnectWorkerState();

  return (
    <Button
      variant="secondary"
      className="gap-2"
      onClick={() => openDialog(networkId)}
    >
      <SquareTerminal className="shrink-0" />
      {children ?? <span className="hidden lg:inline">Connect worker</span>}
    </Button>
  );
}
