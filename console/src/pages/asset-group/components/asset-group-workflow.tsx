import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ToolSelector } from '@/components/common/tool-selector';
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
  OnSchedule,
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
} from '@/services/apis/gen/queries';
import {
  CalendarClockIcon,
  HistoryIcon,
  MoveUpRight,
  Settings,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useState } from 'react';
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
  const toolProviders =
    workspaceToolsInstalled?.data?.filter(
      (tool) =>
        tool.type === ToolsControllerGetManyToolsType.provider ||
        tool.category === ToolCategory.vulnerabilities,
    ) || [];

  // Check if a tool is already added to this group
  const isToolInGroup = (toolName: string) => {
    // Get all jobs from all workflows in the group
    const allJobs =
      workflows.flatMap(
        (groupWorkflow) => groupWorkflow.workflow.content?.jobs || [],
      ) || [];

    // Extract all run values from jobs
    const toolsName = allJobs.map((job) => job.run) || [];

    // Check if the tool name exists in any workflow
    return toolsName.includes(toolName);
  };

  const toolById = Object.fromEntries(
    toolProviders.map((tool) => [tool.id, tool]),
  );

  // Tools that are already part of the workflow
  const selectedToolIds = new Set(
    toolProviders
      .filter((tool) => isToolInGroup(tool.name))
      .map((tool) => tool.id),
  );

  // Get the workflow that contains a specific tool
  const getWorkflowContainingTool = (toolName: string) => {
    return workflows.find((groupWorkflow) => {
      const jobs = groupWorkflow.workflow.content?.jobs || [];
      const toolsName = jobs.map((job) => job.run) || [];
      return toolsName.includes(toolName);
    });
  };

  // Get the current workflow in the group (assuming there's only one workflow per group)
  const getCurrentWorkflow = () => {
    return workflows[0];
  };

  const timezone = getLocalTimezone();
  const currentSchedule = getCurrentWorkflow()?.schedule;
  const lastRun = getCurrentWorkflow()?.lastRun;
  const lastRunText = lastRun
    ? dayjs(lastRun.createdAt).format('DD/MM/YYYY HH:mm')
    : 'Never';
  const nextRun =
    currentSchedule && currentSchedule !== 'disabled'
      ? getNextRun(currentSchedule, timezone)
      : null;
  const nextRunText = nextRun
    ? dayjs(nextRun).format('DD/MM/YYYY HH:mm')
    : 'Disabled';

  // Handle tool click - add if not exists, remove if exists
  const handleToolClick = async (tool: { name: string; id: string }) => {
    const isInGroup = isToolInGroup(tool.name);

    if (isInGroup) {
      // If tool is in group, find the workflow containing it and remove the tool
      const groupWorkflow = getWorkflowContainingTool(tool.name)?.workflow;

      if (!groupWorkflow) {
        toast.error('Workflow not found');
        return;
      }

      try {
        setIsProcessing(true);

        // Filter out the tool from the workflow's jobs
        const updatedJobs =
          groupWorkflow.content?.jobs?.filter((job) => job.run !== tool.name) ||
          [];

        if (updatedJobs.length === 0) {
          // If no jobs left, remove workflow from asset group and delete it
          await removeWorkflowsMutation.mutateAsync({
            groupId: assetGroupId,
            data: {
              workflowIds: [groupWorkflow.id],
            },
          });

          await deleteWorkflowMutation.mutateAsync({
            id: groupWorkflow.id,
          });

          toast.success(
            `Workflow with tool ${tool.name} removed successfully!`,
          );
        } else {
          // Update the workflow with the remaining jobs
          const updatedWorkflowContent = {
            ...groupWorkflow.content,
            jobs: updatedJobs,
          };

          await updateWorkflowMutation.mutateAsync({
            id: groupWorkflow.id,
            data: {
              content: updatedWorkflowContent,
            },
          });

          toast.success(
            `Tool ${tool.name} removed from workflow successfully!`,
          );
        }

        // Refetch workflows to update the UI
        await onRefetch();
      } catch (error) {
        console.error('Error removing tool from workflow:', error);
        toast.error('Failed to remove tool. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    } else {
      // If tool is not in group, check if group already has a workflow
      const existingWorkflow = getCurrentWorkflow()?.workflow ?? null;

      try {
        setIsProcessing(true);

        if (existingWorkflow) {
          // If group already has a workflow, update it by adding the tool
          const updatedJobs = [
            ...(existingWorkflow.content?.jobs || []),
            {
              name: tool.name,
              run: tool.name,
            },
          ];

          const updatedWorkflowContent = {
            ...existingWorkflow.content,
            jobs: updatedJobs,
          };

          await updateWorkflowMutation.mutateAsync({
            id: existingWorkflow.id,
            data: {
              content: updatedWorkflowContent,
            },
          });

          toast.success(
            `Tool ${tool.name} added to existing workflow successfully!`,
          );
        } else {
          // If group has no workflow, create a new workflow with this tool
          const workflowPayload = {
            data: {
              name: `Group Workflow - ${assetGroupId}`,
              content: {
                on: {
                  schedule: OnSchedule['0_0_*_*_*'], // Use correct enum value
                  target: [], // Empty target array
                },
                jobs: [
                  {
                    name: tool.name,
                    run: tool.name,
                  },
                ],
                name: `Group Workflow - ${assetGroupId}`,
              },
              filePath: '', // Empty filePath
            },
          };

          // Create the workflow
          const createdWorkflow =
            await createWorkflowMutation.mutateAsync(workflowPayload);

          // Add the workflow to the asset group
          await addWorkflowsMutation.mutateAsync({
            groupId: assetGroupId,
            data: {
              workflowIds: [createdWorkflow.id],
            },
          });

          toast.success(
            `Workflow created and tool ${tool.name} added successfully!`,
          );
        }

        // Refetch workflows to update the UI
        await onRefetch();
      } catch (error) {
        console.error('Error adding tool:', error);
        toast.error('Failed to add tool. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Disable the workflow schedule by submitting the "disabled" value
  const handleDisableSchedule = () => {
    const workflowId = workflows[0]?.id;
    if (!workflowId) return;

    updateAssetGroupWorkflow(
      { id: workflowId, data: { schedule: 'disabled' } },
      {
        onSuccess: async () => {
          await onRefetch();
          toast.success('Workflow schedule disabled');
          setIsSetScheduleOpen(false);
        },
      },
    );
  };

  // Save a custom cron schedule from the dialog, same API as the dropdown
  const handleSaveCustomSchedule = () => {
    const workflowId = workflows[0]?.id;
    if (!workflowId || !draftSchedule?.cron) return;

    updateAssetGroupWorkflow(
      { id: workflowId, data: { schedule: draftSchedule.cron } },
      {
        onSuccess: async () => {
          await onRefetch();
          toast.success('Update schedule successfuly');
          setIsSetScheduleOpen(false);
        },
      },
    );
  };

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
              disabled={isPendingUpdateSchedule || !workflows[0]?.id}
              onClick={() => setIsSetScheduleOpen(true)}
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
          <Sheet open={isSetScheduleOpen} onOpenChange={setIsSetScheduleOpen}>
            <SheetContent
              side="right"
              className="w-full sm:max-w-lg"
            >
              <SheetHeader>
                <SheetTitle>Set custom schedule</SheetTitle>
                <SheetDescription>
                  Configure a custom cron expression for this workflow.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-4 overflow-y-auto px-4">
                <CronScheduleBuilder
                  defaultValue={
                    currentSchedule && currentSchedule !== 'disabled'
                      ? currentSchedule
                      : undefined
                  }
                  onChange={setDraftSchedule}
                />
              </div>
              <SheetFooter className="mt-auto flex-row items-center">
                <ConfirmDialog
                  title="Disable schedule"
                  description="This will stop the schedule from running. You can re-enable it later."
                  confirmText="Disable"
                  disabled={
                    isPendingUpdateSchedule ||
                    !workflows[0]?.id ||
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
                    !workflows[0]?.id ||
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
            id={getCurrentWorkflow()?.id}
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
            <ToolSelector
              tools={toolProviders.map((tool) => ({
                id: tool.id,
                name: tool.name,
                logoUrl: tool.logoUrl,
              }))}
              selectedIds={selectedToolIds}
              disabled={isProcessing}
              onToggle={(id) => {
                const tool = toolById[id];
                if (tool && !isProcessing) handleToolClick(tool);
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
