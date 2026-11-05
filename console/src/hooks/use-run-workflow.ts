import { orvalClient } from '@/services/apis/axios-client';
import type { WorkflowStepStatusDto } from '@/services/apis/gen/queries';
import { workflowYaml } from '@/components/common/workflow-file-sheet';
import { useQuery } from '@tanstack/react-query';

interface RunWorkflow {
  id: string;
  jobHistoryName?: string;
  workflowId?: string;
  workflowName?: string;
  content?: { on?: Record<string, unknown>; jobs?: Record<string, unknown> };
  steps: WorkflowStepStatusDto[];
}

const RUN_WORKFLOW_KEY = 'run-workflow';

/**
 * The workflow a run was created from. Fetched with orvalClient directly
 * instead of a generated hook so the page works before gen-api runs.
 */
export function useRunWorkflow(
  runId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [RUN_WORKFLOW_KEY, runId],
    queryFn: ({ signal }) =>
      orvalClient<RunWorkflow>({
        url: `/api/jobs-registry/histories/${runId}/workflow`,
        method: 'GET',
        signal,
      }),
    enabled: !!runId && options?.enabled !== false,
    select: (data) => ({
      ...data,
      // The API returns the definition as jsonb; stringify once, here, for the
      // code view.
      yaml: workflowYaml(data.content),
    }),
  });
}
