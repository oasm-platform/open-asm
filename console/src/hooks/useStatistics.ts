import { useStatisticControllerGetStatistics } from '@/services/apis/gen/queries';
import { useWorkspaceSelector } from './useWorkspaceSelector';

export const useStatistics = () => {
    const { selectedWorkspace } = useWorkspaceSelector()
    const { data: statistics, isLoading, ...rest } = useStatisticControllerGetStatistics(
        {
            workspaceId: selectedWorkspace
        },
        {
            query: {
                enabled: !!selectedWorkspace,
                refetchInterval: 5000, // Auto refresh every 5 seconds
            }
        }
    );

    return {
        statistics,
        isLoading,
        ...rest
    };
};
