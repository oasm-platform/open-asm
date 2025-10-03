"use client";

import Page from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useMcpControllerCreateMcpPermission, useMcpControllerGetMcpTools } from "@/services/apis/gen/queries";
import { Box, Loader2Icon, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type FormData = {
    name: string;
    description: string;
};

// Define the structure for selected permissions
type PermissionSelection = {
    workspaceId: string;
    permissions: string[]; // Array of tool IDs or names that are selected
};

const CreateApiKeyPage = () => {
    const navigate = useNavigate();
    const { mutate: createMcpPermission, isPending } = useMcpControllerCreateMcpPermission();
    const { data: tools } = useMcpControllerGetMcpTools();
    const { refetch, handleSelectWorkspace, workspaces } = useWorkspaceSelector();

    const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>();

    // State to store selected permissions for each workspace
    const [selectedPermissions, setSelectedPermissions] = useState<PermissionSelection[]>([]);

    // Function to handle workspace checkbox change
    const handleWorkspaceChange = (workspaceId: string) => {
        // Check if workspace is already in selectedPermissions
        const workspaceIndex = selectedPermissions.findIndex(item => item.workspaceId === workspaceId);
        let newSelectedPermissions: PermissionSelection[];

        if (workspaceIndex > -1) {
            // If workspace is already selected, remove it
            newSelectedPermissions = selectedPermissions.filter(item => item.workspaceId !== workspaceId);
        } else {
            // If workspace is not selected, add it with empty permissions array
            newSelectedPermissions = [...selectedPermissions, { workspaceId, permissions: [] }];
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
    const isWorkspaceSelected = (workspaceId: string) => {
        return selectedPermissions.some(item => item.workspaceId === workspaceId);
    };

    // Function to check if a tool is selected for a specific workspace
    const isToolSelected = (workspaceId: string, toolId: string) => {
        const workspace = selectedPermissions.find(item => item.workspaceId === workspaceId);
        return workspace ? workspace.permissions.includes(toolId) : false;
    };

    const onSubmit = (data: FormData) => {
        // Log the selected permissions to see the structure
        console.log("Selected permissions:", selectedPermissions);

        // Create permission entries for each selected workspace
        if (selectedPermissions.length > 0) {
            // Create permission entries for each selected workspace
            selectedPermissions.forEach(permission => {
                // Only create permissions if there are tools selected for this workspace
                if (permission.permissions.length > 0) {
                    createMcpPermission({
                        data: {
                            // Create a permission object for each workspace with its selected tools
                            value: {
                                workspaceId: permission.workspaceId,
                                permissions: permission.permissions
                            }
                        }
                    }, {
                        onSuccess: () => {
                            toast.success("MCP permissions created successfully");
                            // Navigate back to settings after successful creation
                            navigate('/settings/mcp');
                        },
                        onError: (error) => {
                            console.error("Failed to create MCP permissions:", error);
                            toast.error("Failed to create MCP permissions");
                        }
                    });
                }
            });
        } else {
            // If no permissions are selected, still create the permission entry
            createMcpPermission({
                data: {
                    value: {
                        workspaceId: workspaces[0]?.id || "", // Use first workspace if no specific one is selected
                        permissions: []
                    }
                }
            }, {
                onSuccess: () => {
                    toast.success("MCP permissions created successfully");
                    // Navigate back to settings after successful creation
                    navigate('/settings/mcp');
                },
                onError: (error) => {
                    console.error("Failed to create MCP permissions:", error);
                    toast.error("Failed to create MCP permissions");
                }
            });
        }

        // Reset the form
        reset();
        // Reset the selected permissions when the form is submitted successfully
        setSelectedPermissions([]);
    };

    const handleCancel = () => {
        navigate('/settings/mcp'); // Navigate back to MCP settings page
    };

    return (
        <Page title="Create MCP API Key">
            <div className="max-w-3xl mx-auto p-6">
                <div className="mb-6">
                    <Button 
                        variant="outline" 
                        onClick={handleCancel}
                        className="flex items-center gap-2"
                    >
                        <ArrowLeft size={16} />
                        Back to MCP Settings
                    </Button>
                </div>
                
                <div className="bg-white rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-6">Create New MCP API Key</h2>
                    
                    <form
                        className="flex flex-col gap-6"
                        onSubmit={handleSubmit(onSubmit)}
                    >
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium mb-2">
                                Name
                            </label>
                            <Input
                                {...register("name", { required: "Name is required" })}
                                placeholder="Enter API key name"
                                id="name"
                            />
                            {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name.message}</p>}
                        </div>
                        
                        <div>
                            <label htmlFor="description" className="block text-sm font-medium mb-2">
                                Description
                            </label>
                            <Input
                                {...register("description")}
                                placeholder="Enter API key description"
                                id="description"
                            />
                        </div>

                        {/* Workspace and Tools Selection Section */}
                        <div className="space-y-4 rounded-md border p-4">
                            <h3 className="font-medium text-lg">Select Permissions</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                Select the workspaces and tools this API key will have access to
                            </p>
                            
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
                                        <div className="mt-3 space-y-2 pl-4">
                                            {tools.map((tool) => (
                                                <div key={tool.name} className="flex items-center justify-between py-1">
                                                    <div className='flex items-center gap-2'>
                                                        <Box size={16} />
                                                        <div className='flex flex-col'>
                                                            <span className="text-sm">{tool.name}</span>
                                                            <span className="text-xs text-gray-500">{tool.description}</span>
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

                        <div className="flex justify-end gap-3 pt-4">
                            <Button 
                                variant="outline" 
                                type="button" 
                                onClick={handleCancel}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2Icon className="animate-spin mr-2" size={16} />}
                                Create API Key
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </Page>
    );
};

export default CreateApiKeyPage;