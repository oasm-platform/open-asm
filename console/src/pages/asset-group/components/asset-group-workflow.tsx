import { ScanScheduleSelect } from '@/components/scan-schedule-select';
import { Image } from '@/components/ui/image';
import {
  getLocalTimezone,
  getNextRun,
} from '@/lib/cron-schedule';
import RunWorkflowButton from '@/pages/asset-group/components/run-workflow-button';
import {
  OnSchedule,
  ToolCategory,
  ToolsControllerGetManyToolsType,
  UpdateTargetDtoScanSchedule,
  type AssetGroupWorkflow as AssetGroupWorkflowRelation,
  useAssetGroupControllerAddManyWorkflows,
  useAssetGroupControllerRemoveManyWorkflows,
  useAssetGroupControllerUpdateAssetGroupWorkflow,
  useToolsControllerGetInstalledTools,
  useWorkflowsControllerCreateWorkflow,
  useWorkflowsControllerDeleteWorkflow,
  useWorkflowsControllerUpdateWorkflow,
} from '@/services/apis/gen/queries';
import { CalendarClockIcon, HistoryIcon, MoveUpRight, Plus } from 'lucide-react';
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
    currentSchedule && currentSchedule !== UpdateTargetDtoScanSchedule.disabled
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

  return (
    <div className="space-y-4 mb-4">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Schedule</h2>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="text-sm text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5">
              <HistoryIcon className="size-4" />
              <span>
                Last run:{' '}
                <span className="text-foreground">{lastRunText}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarClockIcon className="size-4" />
              <span>
                Next run:{' '}
                <span className="text-foreground">{nextRunText}</span>
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <ScanScheduleSelect
              disabled={isPendingUpdateSchedule || !workflows[0]?.id}
              value={workflows[0]?.schedule as UpdateTargetDtoScanSchedule}
              onChange={(value: UpdateTargetDtoScanSchedule) => {
                const workflowId = workflows[0]?.id;
                if (!workflowId) return;
                updateAssetGroupWorkflow(
                  { id: workflowId, data: { schedule: value } },
                  {
                    onSuccess: async () => {
                      await onRefetch();
                      toast.success('Update schedule successfuly');
                    },
                  },
                );
              }}
            />
            <RunWorkflowButton id={getCurrentWorkflow()?.id} />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Tools</h2>
        <div className="flex flex-col md:flex-row justify-start md:justify-between md:items-center gap-2">
          <div className="flex gap-4">
          {toolProviders.length === 0 && (
            <Link
              className="text-blue-500 italic flex items-center gap-1 hover:underline"
              to="/tools"
            >
              Open Marketplace <MoveUpRight className="w-4 h-4" />
            </Link>
          )}
          {toolProviders.map((tool) => {
            const isAdded = isToolInGroup(tool.name);
            const isHovered = hoveredToolId === tool.id;
            return (
              <div
                key={tool.id}
                className={`relative space-y-2 ${
                  isAdded
                    ? isProcessing
                      ? 'cursor-wait'
                      : 'cursor-pointer'
                    : 'cursor-pointer'
                }`}
                onClick={() => !isProcessing && handleToolClick(tool)}
                onMouseEnter={() => setHoveredToolId(tool.id)}
                onMouseLeave={() => setHoveredToolId(null)}
              >
                <div
                  className={`transition-all duration-300 ${
                    isAdded ? '' : 'grayscale opacity-60'
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
                <div className="text-center capitalize">{tool.name}</div>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}
