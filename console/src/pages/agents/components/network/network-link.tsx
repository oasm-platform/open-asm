import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n-dictionary';
import type { AgentHttpRequestListItemDto } from '@/services/apis/gen/queries';
import { ArrowLeftRight } from 'lucide-react';
import { createContext, useContext, useMemo } from 'react';
import { isErrorRequest } from './format';

interface NetworkLink {
  /** Logged requests of a tool call, and how many of them failed */
  countsFor: (toolCallId: string) => { total: number; errors: number } | undefined;
  /** Opens the side panel's Network tab on that tool call's requests */
  open: (toolCallId: string) => void;
}

const NetworkLinkContext = createContext<NetworkLink | null>(null);

export const NetworkLinkProvider = NetworkLinkContext.Provider;

/** The context value for the requests already loaded for the Network tab */
export function useNetworkLink(
  requests: AgentHttpRequestListItemDto[],
  open: (toolCallId: string) => void,
): NetworkLink {
  return useMemo(() => {
    const counts = new Map<string, { total: number; errors: number }>();
    for (const r of requests) {
      if (!r.toolCallId) continue;
      const c = counts.get(r.toolCallId) ?? { total: 0, errors: 0 };
      c.total += 1;
      if (isErrorRequest(r)) c.errors += 1;
      counts.set(r.toolCallId, c);
    }
    return { countsFor: (id) => counts.get(id), open };
  }, [requests, open]);
}

/**
 * On a remote command's card: how many HTTP requests the command made, and a
 * way to see them. Nothing when none were logged (or outside a conversation).
 */
export function NetworkLinkButton({ toolCallId }: { toolCallId: string }) {
  const t = useT();
  const link = useContext(NetworkLinkContext);
  const counts = link?.countsFor(toolCallId);
  if (!link || !counts) return null;
  const label = t('agents.network.showRequests');
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-1.5 font-mono text-xs text-zinc-400 tabular-nums hover:bg-zinc-800 hover:text-zinc-100"
      aria-label={
        counts.errors > 0
          ? t('agents.network.linkLabelFailed', {
              count: counts.total,
              failed: counts.errors,
            })
          : t('agents.network.linkLabel', { count: counts.total })
      }
      title={label}
      onClick={() => link.open(toolCallId)}
    >
      <ArrowLeftRight className="size-3.5" />
      {counts.total}
      {counts.errors > 0 && (
        <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
      )}
    </Button>
  );
}
