import { useLiveEvents } from '@/hooks/use-live-events';
import {
  getAgentsControllerGetAgentModesQueryKey,
  useAgentsControllerGetAgentModes,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';

/**
 * The workers agents can use right now. The server lists only online ones;
 * worker lifecycle events refresh the list so it never shows a stale worker.
 */
export function useAgentWorkers() {
  const queryClient = useQueryClient();
  const query = useAgentsControllerGetAgentModes();

  useLiveEvents('worker.*', () => {
    void queryClient.invalidateQueries({
      queryKey: getAgentsControllerGetAgentModesQueryKey(),
    });
  });

  return { ...query, workers: query.data?.workers ?? [] };
}
