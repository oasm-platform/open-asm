import { useStatisticControllerGetStatistics } from '@/services/apis/gen/queries';

export const useStatistics = (workspaceId: string | undefined) => {
    const { data: statistics, isLoading, ...rest } = useStatisticControllerGetStatistics(
        {
            workspaceId: workspaceId ?? ''
        },
        {
            query: {
                enabled: !!workspaceId,
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
