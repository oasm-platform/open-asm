import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import JobStatusBadge from '@/components/ui/job-status';
import {
  CronScheduleBuilder,
  type CronScheduleChange,
} from '@/components/ui/cron-schedule-builder';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Image } from '@/components/ui/image';
import { getLocalTimezone, getNextRun } from '@/lib/cron-schedule';
import RunWorkflowButton from '@/pages/asset-group/components/run-workflow-button';
import {
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
  Plus,
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
  const [hoveredToolId, setHoveredToolId] = useState<string | null>(null);
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Schedule</CardTitle>
            <CardDescription className="hidden md:block">
              Configure the scan frequency and run the workflow on demand.
            </CardDescription>
          </div>
          {lastRun && <JobStatusBadge status={lastRun.status} />}
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPendingUpdateSchedule || !workflows[0]?.id}
              onClick={() => setIsSetScheduleOpen(true)}
            >
              <Settings className="size-4" />
              Config
            </Button>
          </div>
          <Dialog open={isSetScheduleOpen} onOpenChange={setIsSetScheduleOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Set custom schedule</DialogTitle>
                <DialogDescription>
                  Configure a custom cron expression for this workflow.
                </DialogDescription>
              </DialogHeader>
              <CronScheduleBuilder
                defaultValue={
                  currentSchedule && currentSchedule !== 'disabled'
                    ? currentSchedule
                    : undefined
                }
                onChange={setDraftSchedule}
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={isPendingUpdateSchedule}
                  onClick={() => setIsSetScheduleOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    isPendingUpdateSchedule ||
                    !workflows[0]?.id ||
                    !draftSchedule?.cron
                  }
                  onClick={handleSaveCustomSchedule}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Tools</CardTitle>
            <CardDescription className="hidden md:block">
              Scanning tools assigned to this group. Click a tool to add or
              remove it.
            </CardDescription>
          </div>
          <RunWorkflowButton
            id={getCurrentWorkflow()?.id}
            onSuccess={onRefetch}
          />
        </CardHeader>
        <CardContent>
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
            <div className="flex flex-wrap gap-6">
              {toolProviders.map((tool) => {
                const isAdded = isToolInGroup(tool.name);
                const isHovered = hoveredToolId === tool.id;
                return (
                  <div
                    key={tool.id}
                    className={`relative flex flex-col items-center gap-2 ${
                      isProcessing ? 'cursor-wait' : 'cursor-pointer'
                    }`}
                    onClick={() => !isProcessing && handleToolClick(tool)}
                    onMouseEnter={() => setHoveredToolId(tool.id)}
                    onMouseLeave={() => setHoveredToolId(null)}
                  >
                    <div
                      className={`transition-all duration-300 ${
                        isAdded ? '' : 'grayscale opacity-60 hover:grayscale-0 hover:opacity-100'
                      }`}
                    >
                      <Image
                        url={tool.logoUrl}
                        width={64}
                        height={64}
                        className="rounded-full"
                      />
                    </div>
                    {/* Show + icon on hover for unassigned tools */}
                    {!isAdded && isHovered && (
                      <div className="absolute top-0 left-0 w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
                        <Plus size={32} color="white" />
                      </div>
                    )}
                    {/* Show indication for assigned tools */}
                    {isAdded && (
                      <div className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-xs font-bold text-white">
                        ✓
                      </div>
                    )}
                    <div className="text-xs font-medium text-center capitalize">
                      {tool.name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
