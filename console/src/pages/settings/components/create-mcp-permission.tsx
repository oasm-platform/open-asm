"use client";

import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from '@/components/ui/textarea';
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useMcpControllerCreateMcpPermission, useMcpControllerGetMcpTools } from "@/services/apis/gen/queries";
import { Box } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from 'react-router-dom';
import { toast } from "sonner";

type FormData = {
    name: string;
    description: string;
};

// Define the structure for selected permissions
type PermissionSelection = {
    workspaceId: string;
    permissions: string[]; // Array of tool IDs or names that are selected
};


const CreateMcpPermission = () => {
    const { mutate, isPending } = useMcpControllerCreateMcpPermission();
    const { data: tools } = useMcpControllerGetMcpTools()
    const { refetch, workspaces } = useWorkspaceSelector()
    const navigate = useNavigate()
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>();

    // State to store selected permissions for each workspace
    const [selectedPermissions, setSelectedPermissions] = useState<PermissionSelection[]>([]);



    // Function to handle workspace checkbox change
    // According to requirements, workspace is selected when at least one tool is selected
    // When unchecking workspace, all child tools should also be unchecked
    const handleWorkspaceChange = (workspaceId: string) => {
        // Check if workspace is already in selectedPermissions
        const workspaceIndex = selectedPermissions.findIndex(item => item.workspaceId === workspaceId);
        let newSelectedPermissions: PermissionSelection[];

        if (workspaceIndex > -1) {
            // If workspace is already selected, remove it (uncheck all tools)
            newSelectedPermissions = selectedPermissions.filter(item => item.workspaceId !== workspaceId);
        } else {
            // If workspace is not selected, add it with all available tools selected
            // This implements the requirement: "workspace checked depends on just 1 item in tools checked"
            const workspaceTools = tools || [];
            const allToolIds = workspaceTools.map(tool => tool.name);
            newSelectedPermissions = [...selectedPermissions, { workspaceId, permissions: allToolIds }];
        }

        setSelectedPermissions(newSelectedPermissions);
    };

    // Function to handle tool checkbox change for a specific workspace
    const handleToolChange = (workspaceId: string, toolId: string) => {
        const workspaceIndex = selectedPermissions.findIndex(item => item.workspaceId === workspaceId);
        let newSelectedPermissions: PermissionSelection[];

        if (workspaceIndex > -1) {
            // Workspace exists in selectedPermissions
            const workspace = selectedPermissions[workspaceIndex];
            const toolIndex = workspace.permissions.indexOf(toolId);
            const newPermissions = [...workspace.permissions];

            if (toolIndex > -1) {
                // Remove tool from permissions
                newPermissions.splice(toolIndex, 1);
            } else {
                // Add tool to permissions
                newPermissions.push(toolId);
            }

            // Update the workspace with new permissions
            newSelectedPermissions = [...selectedPermissions];
            newSelectedPermissions[workspaceIndex] = { ...workspace, permissions: newPermissions };
        } else {
            // Workspace not in selectedPermissions, add it with the tool
            newSelectedPermissions = [...selectedPermissions, { workspaceId, permissions: [toolId] }];
        }

        setSelectedPermissions(newSelectedPermissions);
    };

    // Function to check if a workspace is selected
    // According to the new requirements, a workspace is considered selected
    // when at least one tool is selected for that workspace
    const isWorkspaceSelected = (workspaceId: string) => {
        const workspace = selectedPermissions.find(item => item.workspaceId === workspaceId);
        return workspace ? workspace.permissions.length > 0 : false;
    };

    // Function to check if a tool is selected for a specific workspace
    const isToolSelected = (workspaceId: string, toolId: string) => {
        const workspace = selectedPermissions.find(item => item.workspaceId === workspaceId);
        return workspace ? workspace.permissions.includes(toolId) : false;
    };

    const onSubmit = (data: FormData) => {
        // Log the selected permissions to see the structure
        console.log("Selected permissions:", selectedPermissions);
        // Create workspace first, then assign permissions
        mutate({
            data: {
                value: selectedPermissions,
                name: data.name,
                description: data.description,
            },
        }, {
            onSuccess: () => {
                toast.success("MCP Permission created successfully")
                refetch()
                navigate(-1)
            },
            onError: () => {
                toast.error("Failed to create MCP Permission")
            }
        })

    };

    return (
        <Page title="Create MCP Permissions" isShowButtonGoBack>
            <form
                className="flex flex-col gap-4 w-full max-w-xl"
                onSubmit={handleSubmit(onSubmit)}
            >
                <Input
                    {...register("name", { required: "Name is required" })}
                    placeholder="Name"
                />
                {errors.name && <p className="text-red-600 text-sm">{errors.name.message}</p>}

                <Textarea
                    rows={4}
                    {...register("description", { required: false })}
                    placeholder="Description"
                />
                {/* Workspace and Tools Selection Section */}
                <div className="rounded-md py-1 hide-scrollbar">
                    {workspaces.map((workspace) => (
                        <div key={workspace.id} className="mb-4 p-3 rounded-xl border">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">{workspace.name}</span>
                                <Checkbox
                                    id={`workspace-${workspace.id}`}
                                    checked={isWorkspaceSelected(workspace.id)}
                                    onCheckedChange={() => handleWorkspaceChange(workspace.id)}
                                />
                            </div>

                            {/* Tools list - only show if workspace is selected */}
                            {isWorkspaceSelected(workspace.id) && tools && (
                                <div>
                                    {tools.map((tool) => (
                                        <div key={tool.name} className="flex items-center justify-between py-1">
                                            <div className='flex items-center gap-2'>
                                                <Box />
                                                <div className='flex flex-col'>
                                                    <span>{tool.name}</span>
                                                    <span className="text-sm text-gray-500">{tool.description}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center">
                                                <Checkbox
                                                    id={`tool-${workspace.id}-${tool.name}`}
                                                    checked={isToolSelected(workspace.id, tool.name)}
                                                    onCheckedChange={() => handleToolChange(workspace.id, tool.name)}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                </div>
                <Button disabled={isPending} type="submit">Save</Button>
            </form>
        </Page>
    );
};

export default CreateMcpPermission;
