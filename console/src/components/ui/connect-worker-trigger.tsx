import { Button } from '@/components/ui/button';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { Plug } from 'lucide-react';
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
      variant="outline"
      className="gap-2"
      onClick={() => openDialog(networkId)}
    >
      <Plug className="shrink-0" />
      {children ?? 'Connect'}
    </Button>
  );
}
