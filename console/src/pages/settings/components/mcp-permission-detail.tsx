import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useMcpControllerGetMcpTools, type McpPermission } from '@/services/apis/gen/queries';
import { TooltipContent } from '@radix-ui/react-tooltip';
import { Box, ChevronDown, ChevronRight, Key } from 'lucide-react';
import { useState } from 'react';
import ConnectMcpButton from './connect-button';
import { DeleteMcpPermission } from './delete-mcp-permission';

export const WorkspacePermissionDetails = ({ permission }: { permission: McpPermission }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { workspaces } = useWorkspaceSelector()
    const { data: tools } = useMcpControllerGetMcpTools()
    console.log(tools);
    return (
        <div className="space-y-2">
            <div className='flex justify-between items-center'>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="cursor-pointer space-x-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                    <Key className='w-5 h-5' />
                    <span>{permission.name}</span>
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full px-2 py-0.5">
                        {permission.value.length} Workspace{permission.value.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full px-2 py-0.5">
                        {permission.value.reduce((total, permValue) => total + permValue.permissions.length, 0)} permission{permission.value.reduce((total, permValue) => total + permValue.permissions.length, 0) !== 1 ? 's' : ''}
                    </span>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className='flex gap-2'>
                    <ConnectMcpButton permission={permission} />
                    <DeleteMcpPermission id={permission.id} />
                </div>
            </div>
            {isExpanded && (
                <div className='space-y-5'>
                    {permission.value.map((permValue, index) => {
                        const workspace = workspaces.find((ws) => ws.id === permValue.workspaceId);
                        return (
                            <div key={index} className="rounded-lg">
                                <div className="font-medium text-gray-800 dark:text-gray-200">
                                    {workspace?.name || 'Unknown Workspace'}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {permValue.permissions.map((permission, idx) => (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge className="h-7 cursor-pointer" variant='outline' key={idx}>
                                                    <Box className='w-4 h-4 rounded-full' />
                                                    {permission}
                                                </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-[200px] z-50 bg-background rounded text-foreground border p-3">
                                                {tools?.find((tool) => tool.name === permission)?.description || 'No description available'}
                                            </TooltipContent>
                                        </Tooltip>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};