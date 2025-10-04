import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import type { McpPermission } from '@/services/apis/gen/queries';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import ConnectMcpButton from './connect-button';
import { DeleteMcpPermission } from './delete-mcp-permission';

export const WorkspacePermissionDetails = ({ permission }: { permission: McpPermission }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { workspaces } = useWorkspaceSelector()

    return (
        <div className="space-y-2">
            <div className='flex justify-between items-center'>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="cursor-pointer flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                    {permission.name}
                    {isExpanded ? <ChevronDown className="h-4 w-4 mx-2" /> : <ChevronRight className="h-4 w-4 mx-2" />}
                    {permission.value.length} Workspace{permission.value.length !== 1 ? 's' : ''}
                    <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full px-2 py-0.5">
                        {permission.value.reduce((total, permValue) => total + permValue.permissions.length, 0)} permission{permission.value.reduce((total, permValue) => total + permValue.permissions.length, 0) !== 1 ? 's' : ''}
                    </span>

                </button>
                <div className='flex gap-2'>
                    <ConnectMcpButton permission={permission} />
                    <DeleteMcpPermission id={permission.id} />
                </div>
            </div>
            {isExpanded && (
                <div className='space-y-2'>
                    {permission.value.map((permValue, index) => {
                        const workspace = workspaces.find((ws) => ws.id === permValue.workspaceId);
                        return (
                            <div key={index} className="p-3 bg-card rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="font-medium text-gray-800 dark:text-gray-200">
                                        {workspace?.name || 'Unknown Workspace'}
                                    </div>
                                    <span className="text-xs bg-gray-100 dark:bg-gray-800/50 text-gray-800 dark:text-gray-200 rounded-full px-2 py-1">
                                        {permValue.permissions.length} permission{permValue.permissions.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {permValue.permissions.map((permission, idx) => (
                                        <span
                                            key={idx}
                                            className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded px-2 py-1"
                                        >
                                            {permission}
                                        </span>
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