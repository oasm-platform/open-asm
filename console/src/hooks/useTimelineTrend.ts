import { useStatisticControllerGetTimelineStatistics } from '@/services/apis/gen/queries';
import { useWorkspaceState } from './useWorkspaceSelector';

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
  services: number;
  createdAt: string;
  updatedAt: string;
};

export type Trend = {
  difference: number;
  isIncreasing: boolean;
  isDecreasing: boolean;
};

/** How many days back the change badges compare against. */
export const TREND_WINDOW_DAYS = 7;

export const useTimelineTrend = () => {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data: timeline } = useStatisticControllerGetTimelineStatistics({
    query: {
      queryKey: ['/api/statistics/timeline', selectedWorkspaceId],
      enabled: !!selectedWorkspaceId,
    },
  });

  /** Change of `field` over the last {@link TREND_WINDOW_DAYS} days. */
  const calculateTrend = (field: keyof TimelineStatistic): Trend | null => {
    const points = timeline?.data;
    if (!points || points.length < 2) return null;

    // One point per day, oldest first, ending with the live numbers; a
    // shorter history compares against its first day.
    const latest = points[points.length - 1][field] as number;
    const previous = points[Math.max(0, points.length - 1 - TREND_WINDOW_DAYS)][
      field
    ] as number;
    const difference = latest - previous;

    return {
      difference,
      isIncreasing: difference > 0,
      isDecreasing: difference < 0,
    };
  };

  return { calculateTrend, timelineData: timeline?.data };
};
