import { useStatisticControllerGetTimelineStatistics } from '@/services/apis/gen/queries';
import { useWorkspaceSelector } from './useWorkspaceSelector';

export type TimelineStatistic = {
    id: string;
    assets: number;
    targets: number;
    vuls: number;
    criticalVuls: number;
    highVuls: number;
    mediumVuls: number;
    lowVuls: number;
    infoVuls: number;
    techs: number;
    ports: number;
    createdAt: string;
    updatedAt: string;
};

export type Trend = {
    difference: number;
    isIncreasing: boolean;
    isDecreasing: boolean;
};

export const useTimelineTrend = () => {
    const { selectedWorkspace } = useWorkspaceSelector()
    const { data: timeline } = useStatisticControllerGetTimelineStatistics({
        query: {
            queryKey: [selectedWorkspace]
        }
    });

    const calculateTrend = (field: keyof TimelineStatistic): Trend | null => {
        if (!timeline?.data || timeline.data.length < 2) return null;

        const sortedData = [...timeline.data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const latest = sortedData[0][field] as number;
        const previousDifferent = sortedData.find(item => (item[field] as number) !== latest);

        if (!previousDifferent) {
            return {
                difference: 0,
                isIncreasing: false,
                isDecreasing: false
            };
        }

        const previous = previousDifferent[field] as number;
        const difference = latest - previous;

        return {
            difference,
            isIncreasing: difference > 0,
            isDecreasing: difference < 0
        };
    };

    return { calculateTrend, timelineData: timeline?.data };
};