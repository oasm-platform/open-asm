import { ScanScheduleSelect } from '@/components/scan-schedule-select';
import { Image } from '@/components/ui/image';
import {
  OnSchedule,
  ToolCategory,
  UpdateTargetDtoScanSchedule,
  useAssetGroupControllerAddManyWorkflows,
  useAssetGroupControllerGetWorkflowsByAssetGroupsId,
  useAssetGroupControllerRemoveManyWorkflows,
  useAssetGroupControllerUpdateAssetGroupWorkflow,
  useToolsControllerGetInstalledTools,
  useWorkflowsControllerCreateWorkflow,
  useWorkflowsControllerDeleteWorkflow,
  useWorkflowsControllerUpdateWorkflow,
} from '@/services/apis/gen/queries';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function AssetGroupWorkflow({
  assetGroupId,
}: {
  assetGroupId: string;
}) {
  const { data: groupWorkflows, refetch: refetchWorkflows } =
    useAssetGroupControllerGetWorkflowsByAssetGroupsId(assetGroupId);
  const { data: workspaceToolsInstalled } =
    useToolsControllerGetInstalledTools();
  const [hoveredToolId, setHoveredToolId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const {
    mutate: updateAssetGroupWorkflowMutation,
    isPending: isPendingUpdateSchedule,
  } = useAssetGroupControllerUpdateAssetGroupWorkflow();
  // Create/update/delete workflow mutation
  const createWorkflowMutation = useWorkflowsControllerCreateWorkflow();
  const updateWorkflowMutation = useWorkflowsControllerUpdateWorkflow();
  const deleteWorkflowMutation = useWorkflowsControllerDeleteWorkflow();
  const addWorkflowsMutation = useAssetGroupControllerAddManyWorkflows();
  const removeWorkflowsMutation = useAssetGroupControllerRemoveManyWorkflows();

  // Filter tools with category "vulnerabilities"
  const vulnerabilityTools =
    workspaceToolsInstalled?.data?.filter(
      (tool) => tool.category === ToolCategory.vulnerabilities,
    ) || [];

  // Check if a tool is already added to this group
  const isToolInGroup = (toolName: string) => {
    // Get all jobs from all workflows in the group
    const allJobs =
      groupWorkflows?.data?.flatMap(
        (groupWorkflow) => groupWorkflow.workflow.content?.jobs || [],
      ) || [];

    // Extract all run values from jobs
    const toolsName = allJobs.map((job: { run: string }) => job.run) || [];

    // Check if the tool name exists in any workflow
    return toolsName.includes(toolName);
  };

  // Get the workflow that contains a specific tool
  const getWorkflowContainingTool = (toolName: string) => {
    return groupWorkflows?.data?.find((groupWorkflow) => {
      const jobs = groupWorkflow.workflow.content?.jobs || [];
      const toolsName = jobs.map((job: { run: string }) => job.run) || [];
      return toolsName.includes(toolName);
    });
  };

  // Get the current workflow in the group (assuming there's only one workflow per group)
  const getCurrentWorkflow = () => {
    return groupWorkflows?.data?.[0];
  };

  // Handle tool click - add if not exists, remove if exists
  const handleToolClick = async (tool: { name: string; id: string }) => {
    const isInGroup = isToolInGroup(tool.name);

    if (isInGroup) {
      // If tool is in group, find the workflow containing it and remove the tool
      const workflow = getWorkflowContainingTool(tool.name)?.workflow;

      if (!workflow) {
        toast.error('Workflow not found');
        return;
      }

      try {
        setIsProcessing(true);

        // Filter out the tool from the workflow's jobs
        const updatedJobs =
          workflow.content?.jobs?.filter((job) => job.run !== tool.name) || [];

        if (updatedJobs.length === 0) {
          // If no jobs left, remove workflow from asset group and delete it
          await removeWorkflowsMutation.mutateAsync({
            groupId: assetGroupId,
            data: {
              workflowIds: [workflow.id],
            },
          });

          await deleteWorkflowMutation.mutateAsync({
            id: workflow.id,
          });

          toast.success(
            `Workflow with tool ${tool.name} removed successfully!`,
          );
        } else {
          // Update the workflow with the remaining jobs
          const updatedWorkflowContent = {
            ...workflow.content,
            jobs: updatedJobs,
          };

          await updateWorkflowMutation.mutateAsync({
            id: workflow.id,
            data: {
              content: updatedWorkflowContent,
            },
          });

          toast.success(
            `Tool ${tool.name} removed from workflow successfully!`,
          );
        }

        // Refetch workflows to update the UI
        await refetchWorkflows();
      } catch (error) {
        console.error('Error removing tool from workflow:', error);
        toast.error('Failed to remove tool. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    } else {
      // If tool is not in group, check if group already has a workflow
      const existingWorkflow = getCurrentWorkflow()?.workflow;

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
              name: `Vulnerability Scan Workflow - ${assetGroupId}`,
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
                name: `Vulnerability Scan Workflow - ${assetGroupId}`,
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
        await refetchWorkflows();
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
      <h2 className="text-xl font-semibold">Tools</h2>
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          {vulnerabilityTools.map((tool) => {
            const isAdded = isToolInGroup(tool.name);
            const isHovered = hoveredToolId === tool.id;
            return (
              <div
                key={tool.id}
                style={{
                  position: 'relative',
                  cursor: isAdded
                    ? isProcessing
                      ? 'wait'
                      : 'pointer'
                    : 'pointer',
                }}
                className="space-y-2"
                onClick={() => !isProcessing && handleToolClick(tool)}
                onMouseEnter={() => setHoveredToolId(tool.id)}
                onMouseLeave={() => setHoveredToolId(null)}
              >
                <div
                  style={{
                    filter: isAdded ? 'none' : 'grayscale(100%)',
                    opacity: isAdded ? 1 : 0.6,
                    transition: 'all 0.3s ease',
                  }}
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
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <Plus size={32} color="white" />
                  </div>
                )}
                {/* Show indication for assigned tools */}
                {isAdded && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#10b981',
                      border: '2px solid white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: 'white',
                    }}
                  >
                    ✓
                  </div>
                )}
                <div className="text-center capitalize">{tool.name}</div>
              </div>
            );
          })}
        </div>
        <ScanScheduleSelect
          disabled={isPendingUpdateSchedule || !groupWorkflows?.data[0]?.id}
          value={
            groupWorkflows?.data[0]?.schedule as UpdateTargetDtoScanSchedule
          }
          onChange={(value: UpdateTargetDtoScanSchedule) => {
            console.log(value);
            updateAssetGroupWorkflowMutation(
              {
                id: groupWorkflows?.data[0]?.id as string,
                data: {
                  schedule: value,
                },
              },
              {
                onSuccess: async () => {
                  await refetchWorkflows();
                  toast.success('Update schedule successfuly');
                },
              },
            );
          }}
        />
      </div>
    </div>
  );
}
