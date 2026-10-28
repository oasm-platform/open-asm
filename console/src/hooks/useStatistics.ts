import { useStatisticControllerGetStatistics } from '@/services/apis/gen/queries';
import { useWorkspaceState } from './useWorkspaceSelector';

export const useStatistics = () => {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const {
    data: statistics,
    isLoading,
    ...rest
  } = useStatisticControllerGetStatistics({
    query: {
      enabled: !!selectedWorkspaceId,
      // The server shares these numbers for a minute; polling faster only
      // re-reads the same cached value.
      refetchInterval: 60_000,
    },
  });

  return {
    statistics,
    isLoading,
    ...rest,
  };
};
