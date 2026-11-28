import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useT } from '@/lib/i18n-dictionary';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useReportsControllerCreateSchedule,
  useReportsControllerGenerateQueryReport,
  useReportsControllerGenerateSummaryReport,
  useReportsControllerGenerateVulReport,
} from '@/services/apis/gen/queries';
import { addPendingReport } from './pending-reports';
import { PERIOD_PRESETS, periodRange, reportCountKey, type ReportDraft } from './report-meta';
import { reportSchedulesKey } from './report-schedules';

/** Queues a report (or saves its schedule) from a draft; resolves true once accepted. */
export function useGenerateReport() {
  const t = useT();
  const queryClient = useQueryClient();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const summary = useReportsControllerGenerateSummaryReport();
  const vulnerability = useReportsControllerGenerateVulReport();
  const query = useReportsControllerGenerateQueryReport();
  const schedule = useReportsControllerCreateSchedule();

  const generate = async (draft: ReportDraft): Promise<boolean> => {
    const targetIds = draft.targetIds.length > 0 ? draft.targetIds : undefined;
    try {
      if (draft.template === 'QUERY') {
        if (!draft.savedQueryId) return false;
        await query.mutateAsync({ data: { savedQueryId: draft.savedQueryId } });
      } else if (draft.repeat) {
        await schedule.mutateAsync({
          data: {
            type: draft.template,
            cron: draft.cron,
            targetIds,
            minSeverity: draft.template === 'VULNERABILITY' ? draft.minSeverity : undefined,
          },
        });
        void queryClient.invalidateQueries({ queryKey: reportSchedulesKey(selectedWorkspaceId) });
        toast.success(t('reports.toast.scheduleCreated'));
        return true;
      } else if (draft.template === 'SUMMARY') {
        await summary.mutateAsync({
          data: { ...periodRange(draft.period, draft.customRange), targetIds },
        });
      } else {
        await vulnerability.mutateAsync({
          data: {
            ...periodRange(draft.period, draft.customRange),
            targetIds,
            minSeverity: draft.minSeverity,
          },
        });
      }
      if (selectedWorkspaceId) {
        const allReports = queryClient.getQueryData<{ total?: number }>(
          reportCountKey(selectedWorkspaceId),
        );
        addPendingReport({
          workspaceId: selectedWorkspaceId,
          template: draft.template,
          detailKey:
            draft.template === 'QUERY'
              ? undefined
              : PERIOD_PRESETS.find((preset) => preset.value === draft.period)?.labelKey,
          total: allReports?.total ?? 0,
        });
      }
      toast.success(t('reports.toast.queued'));
      return true;
    } catch {
      toast.error(
        t(
          draft.repeat && draft.template !== 'QUERY'
            ? 'reports.toast.scheduleFailed'
            : {
                SUMMARY: 'reports.toast.summaryFailed',
                VULNERABILITY: 'reports.toast.vulnFailed',
                QUERY: 'reports.toast.queryFailed',
              }[draft.template],
        ),
      );
      return false;
    }
  };

  return {
    generate,
    isPending:
      summary.isPending || vulnerability.isPending || query.isPending || schedule.isPending,
  };
}
