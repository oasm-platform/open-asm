import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useNavigate } from 'react-router-dom';

export function WorkspaceSwitcher() {
    const navigate = useNavigate();
    const {
        workspaces,
        isLoading,
        selectedWorkspace,
        handleSelectWorkspace,
    } = useWorkspaceSelector();

    const itemHeightClass = "h-10";

    if (isLoading) {
        return (
            <SidebarMenu>
                <SidebarMenuItem>
                    <Skeleton className={`${itemHeightClass} w-full`} />
                </SidebarMenuItem>
            </SidebarMenu>
        );
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className={`${itemHeightClass} data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground`}
                        >
                            <div className="flex flex-col gap-0.5 leading-none">
                                <span className="font-semibold">
                                    {
                                        workspaces.find((ws) => ws.id === selectedWorkspace)?.name ||
                                        "Select workspace"
                                    }
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-auto" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                        align="start"
                        className="min-w-[var(--radix-dropdown-menu-trigger-width)] p-2"
                    >
                        {workspaces.length > 0 ? (
                            <>
                                {workspaces.map((workspace) => (
                                    <DropdownMenuItem
                                        key={workspace.id}
                                        onSelect={() => handleSelectWorkspace(workspace.id)}
                                        className="cursor-pointer px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between"
                                    >
                                        {workspace.name}
                                        {workspace.id === selectedWorkspace && <Check size={16} />}
                                    </DropdownMenuItem>
                                ))}

                                {/* Separator */}
                                <div className="my-2 h-px bg-gray-200 dark:bg-gray-700" />
                            </>
                        ) : (
                            <div className="text-center text-sm text-muted-foreground px-2 py-4">
                                No workspace
                            </div>
                        )}

                        {/* Create workspace */}
                        <DropdownMenuItem
                            onClick={() => navigate('/workspaces/create')}
                            className="cursor-pointer gap-1 px-2 py-1.5 rounded hover:bg-muted flex items-center justify-start"
                        >
                            <Plus size={20} />  New workspace
                        </DropdownMenuItem>
                    </DropdownMenuContent>

                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
