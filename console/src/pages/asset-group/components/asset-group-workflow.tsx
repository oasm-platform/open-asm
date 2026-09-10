import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  ToolPipelineBuilder,
  type PipelineToolEntry,
} from '@/pages/asset-group/components/tool-pipeline-builder';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import JobStatusBadge from '@/components/ui/job-status';
import { useNavigate } from '@tanstack/react-router';
import {
  CronScheduleBuilder,
  type CronScheduleChange,
} from '@/components/ui/cron-schedule-builder';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { getLocalTimezone, getNextRun } from '@/lib/cron-schedule';
import RunWorkflowButton from '@/pages/asset-group/components/run-workflow-button';
import {
  AssetGroupLastRunDtoStatus,
  ToolCategory,
  ToolsControllerGetManyToolsType,
  type AssetGroupWorkflow as AssetGroupWorkflowRelation,
  useAssetGroupControllerAddManyWorkflows,
  useAssetGroupControllerRemoveManyWorkflows,
  useAssetGroupControllerUpdateAssetGroupWorkflow,
  useToolsControllerGetInstalledTools,
  useWorkflowsControllerCreateWorkflow,
  useWorkflowsControllerDeleteWorkflow,
  useWorkflowsControllerUpdateWorkflow,
  type Tool,
} from '@/services/apis/gen/queries';
import {
  CalendarClockIcon,
  HistoryIcon,
  MoveUpRight,
  Settings,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useCallback, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';

export default function AssetGroupWorkflow({
  assetGroupId,
  workflows,
  onRefetch,
}: {
  assetGroupId: string;
  workflows: AssetGroupWorkflowRelation[];
  onRefetch: () => void;
}) {
  const { data: workspaceToolsInstalled } =
    useToolsControllerGetInstalledTools();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSetScheduleOpen, setIsSetScheduleOpen] = useState(false);
  const [draftSchedule, setDraftSchedule] =
    useState<CronScheduleChange | null>(null);
  const {
    mutate: updateAssetGroupWorkflow,
    isPending: isPendingUpdateSchedule,
  } = useAssetGroupControllerUpdateAssetGroupWorkflow();
  // Create/update/delete workflow mutation
  const createWorkflowMutation = useWorkflowsControllerCreateWorkflow();
  const updateWorkflowMutation = useWorkflowsControllerUpdateWorkflow();
  const deleteWorkflowMutation = useWorkflowsControllerDeleteWorkflow();
  const addWorkflowsMutation = useAssetGroupControllerAddManyWorkflows();
  const removeWorkflowsMutation = useAssetGroupControllerRemoveManyWorkflows();

  // Filter tools with category "vulnerabilities"
  const toolProviders = useMemo(
    () =>
      workspaceToolsInstalled?.data?.filter(
        (tool) =>
          tool.type === ToolsControllerGetManyToolsType.provider ||
          tool.category === ToolCategory.vulnerabilities,
      ) || [],
    [workspaceToolsInstalled?.data],
  );

  const toolByName = useMemo(
    () => new Map(toolProviders.map((tool) => [tool.name, tool])),
    [toolProviders],
  );
  const toolById = useMemo(
    () => new Map(toolProviders.map((tool) => [tool.id, tool])),
    [toolProviders],
  );

  // Only one workflow per group is expected.
  const currentWorkflow = workflows[0];
  const workflowId = currentWorkflow?.id;

  const timezone = getLocalTimezone();
  const currentSchedule = currentWorkflow?.schedule;
  const lastRun = currentWorkflow?.lastRun;
  const lastRunText = useMemo(
    () =>
      lastRun ? dayjs(lastRun.createdAt).format('DD/MM/YYYY HH:mm') : 'Never',
    [lastRun],
  );
  const nextRun = useMemo(
    () =>
      currentSchedule && currentSchedule !== 'disabled'
        ? getNextRun(currentSchedule, timezone)
        : null,
    [currentSchedule, timezone],
  );
  const nextRunText = useMemo(
    () => (nextRun ? dayjs(nextRun).format('DD/MM/YYYY HH:mm') : 'Disabled'),
    [nextRun],
  );

  // ---- Pipeline value derived from workflow jobs[] order ----
  // jobs[] order IS the execution order (scheduler runs jobs[0], chain uses
  // index). The builder's value array preserves that order 1:1, and every
  // mutation below writes the array back with the same ordering.
  const jobs = useMemo(
    () => currentWorkflow?.workflow.content?.jobs ?? [],
    [currentWorkflow],
  );
  const jobsJson = useMemo(() => JSON.stringify(jobs), [jobs]);
  const pipeline: PipelineToolEntry[] = useMemo(() => {
    const jobs = currentWorkflow?.workflow.content?.jobs ?? [];
    return jobs.map((job) => {
      const tool = toolByName.get(job.run);
      return {
        toolId: tool?.id ?? job.run,
        ...(job.config ? { config: job.config as Record<string, unknown> } : {}),
        ...(job.configProfileId
          ? { configProfileId: job.configProfileId }
          : {}),
      };
    });
    // jobsJson captures order + per-job config changes; toolByName covers id mapping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsJson, toolByName]);

  const toolNameOf = useCallback(
    (entry: PipelineToolEntry): string =>
      toolById.get(entry.toolId)?.name ?? entry.toolId,
    [toolById],
  );

  /** Persist the full ordered pipeline as jobs[] (append/update, order preserved). */
  const persistPipeline = useCallback(async (next: PipelineToolEntry[]) => {
    const existingWorkflow = currentWorkflow?.workflow ?? null;
    try {
      setIsProcessing(true);
      const jobs = next.map((entry) => {
        const name = toolNameOf(entry);
        return {
          name,
          run: name,
          ...(entry.config ? { config: entry.config } : {}),
          ...(entry.configProfileId
            ? { configProfileId: entry.configProfileId }
            : {}),
        };
      });
      if (existingWorkflow) {
        if (jobs.length === 0) {
          await removeWorkflowsMutation.mutateAsync({
            groupId: assetGroupId,
            data: { workflowIds: [existingWorkflow.id] },
          });
          await deleteWorkflowMutation.mutateAsync({
            id: existingWorkflow.id,
          });
          toast.success('Workflow removed — no tools left in the pipeline.');
        } else {
          await updateWorkflowMutation.mutateAsync({
            id: existingWorkflow.id,
            data: {
              content: { ...existingWorkflow.content, jobs },
            },
          });
          toast.success('Pipeline saved successfully!');
        }
      } else if (jobs.length > 0) {
        const createdWorkflow = await createWorkflowMutation.mutateAsync({
          data: {
            name: `Group Workflow - ${assetGroupId}`,
            content: {
              on: { schedule: '0 0 * * *', target: [] },
              jobs,
              name: `Group Workflow - ${assetGroupId}`,
            },
            filePath: '',
          },
        });
        await addWorkflowsMutation.mutateAsync({
          groupId: assetGroupId,
          data: { workflowIds: [createdWorkflow.id] },
        });
        toast.success('Workflow created with the selected pipeline!');
      }
      await onRefetch();
    } catch (error) {
      console.error('Error saving tool pipeline:', error);
      toast.error('Failed to save pipeline. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [
    currentWorkflow,
    toolNameOf,
    removeWorkflowsMutation,
    deleteWorkflowMutation,
    updateWorkflowMutation,
    createWorkflowMutation,
    addWorkflowsMutation,
    assetGroupId,
    onRefetch,
  ]);

  const handleOpenSchedule = useCallback(() => {
    setIsSetScheduleOpen(true);
  }, []);

  const handleScheduleOpenChange = useCallback((open: boolean) => {
    setIsSetScheduleOpen(open);
  }, []);

  const handlePipelineChange = useCallback(
    (next: PipelineToolEntry[]) => {
      if (!isProcessing) void persistPipeline(next);
    },
    [persistPipeline, isProcessing],
  );

  // Disable the workflow schedule by submitting the "disabled" value
  const handleDisableSchedule = useCallback(() => {
    if (!workflowId) return;

    updateAssetGroupWorkflow(
      { id: workflowId, data: { schedule: 'disabled' } },
      {
        onSuccess: async () => {
          await onRefetch();
          toast.success('Workflow schedule disabled');
          setIsSetScheduleOpen(false);
        },
        onError: () => {
          toast.error('Failed to disable the workflow schedule');
        },
      },
    );
  }, [workflowId, updateAssetGroupWorkflow, onRefetch]);

  // Save a custom cron schedule from the dialog, same API as the dropdown
  const handleSaveCustomSchedule = useCallback(() => {
    if (!workflowId || !draftSchedule?.cron) return;

    updateAssetGroupWorkflow(
      { id: workflowId, data: { schedule: draftSchedule.cron } },
      {
        onSuccess: async () => {
          await onRefetch();
          toast.success('Schedule updated successfully');
          setIsSetScheduleOpen(false);
        },
        onError: () => {
          toast.error('Failed to update the schedule');
        },
      },
    );
  }, [workflowId, draftSchedule, updateAssetGroupWorkflow, onRefetch]);

  return (
    <div className="space-y-4 mb-4">
      <Card className="py-2 gap-2">
        <CardHeader className="flex flex-row items-center justify-between gap-4 px-2 md:px-4 py-2">
          <div>
            <CardTitle>Schedule</CardTitle>
            <CardDescription className="hidden md:block">
              Configure the scan frequency and run the workflow on demand.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {lastRun && (
              <JobStatusBadge
                status={lastRun.status}
                onClick={() =>
                  navigate({
                    to: '/jobs/runs/$id',
                    params: { id: lastRun.id },
                  })
                }
              />
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Configure schedule"
              disabled={isPendingUpdateSchedule || !workflowId}
              onClick={handleOpenSchedule}
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-2 md:px-4 py-2">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/50">
                  <HistoryIcon className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last run</p>
                  <p className="text-sm font-medium text-foreground tabular-nums">
                    {lastRun
                      ? `${lastRun.jobRunType.charAt(0).toUpperCase()}${lastRun.jobRunType.slice(1)} at ${lastRunText}`
                      : lastRunText}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/50">
                  <CalendarClockIcon className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Next run</p>
                  <p className="text-sm font-medium text-foreground tabular-nums">
                    {nextRunText}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Sheet open={isSetScheduleOpen} onOpenChange={handleScheduleOpenChange}>
            <SheetContent
              side="right"
              className="w-full sm:max-w-lg gap-3"
            >
              <SheetHeader className="px-4 pt-3 pb-2">
                <SheetTitle>Set custom schedule</SheetTitle>
                <SheetDescription>
                  Configure a custom cron expression for this workflow.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-0">
                <CronScheduleBuilder
                  defaultValue={
                    currentSchedule && currentSchedule !== 'disabled'
                      ? currentSchedule
                      : undefined
                  }
                  onChange={setDraftSchedule}
                />
              </div>
              <SheetFooter className="mt-auto flex-row items-center pt-2">
                <ConfirmDialog
                  title="Disable schedule"
                  description="This will stop the schedule from running. You can re-enable it later."
                  confirmText="Disable"
                  disabled={
                    isPendingUpdateSchedule ||
                    !workflowId ||
                    currentSchedule === 'disabled'
                  }
                  onConfirm={handleDisableSchedule}
                  trigger={
                    <Button variant="outline">Disable</Button>
                  }
                />
                <Button
                  className="ml-auto"
                  disabled={
                    isPendingUpdateSchedule ||
                    !workflowId ||
                    !draftSchedule?.cron
                  }
                  onClick={handleSaveCustomSchedule}
                >
                  Set
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </CardContent>
      </Card>
      <Card className="py-2 gap-2">
        <CardHeader className="flex flex-row items-center justify-between gap-4 px-2 md:px-4 py-2">
          <div>
            <CardTitle>Tools</CardTitle>
            <CardDescription className="hidden md:block">
              Scanning tools assigned to this group. Click a tool to add or
              remove it.
            </CardDescription>
          </div>
          <RunWorkflowButton
            id={workflowId}
            disabled={
              lastRun?.status ===
                AssetGroupLastRunDtoStatus.pending ||
              lastRun?.status ===
                AssetGroupLastRunDtoStatus.in_progress
            }
            onSuccess={onRefetch}
          />
        </CardHeader>
        <CardContent className="px-2 md:px-4 py-2">
          {toolProviders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No scanning tools installed yet
              </p>
              <Link
                className="text-blue-500 italic flex items-center gap-1 hover:underline"
                to="/tools"
              >
                Open Marketplace <MoveUpRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <ToolPipelineBuilder
              tools={toolProviders as Tool[]}
              value={pipeline}
              onChange={handlePipelineChange}
              disabled={isProcessing}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
