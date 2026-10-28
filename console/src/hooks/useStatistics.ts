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
      refetchInterval: 5000, // Auto refresh every 5 seconds
    },
  });

  return {
    statistics,
    isLoading,
    ...rest,
  };
};
