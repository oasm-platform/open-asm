"use client";

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
import { Skeleton } from "@/components/ui/skeleton"; // Assuming you have a Skeleton component
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";

export function WorkspaceSwitcher() {
    const {
        workspaces,
        isLoading,
        selectedWorkspace,
        handleSelectWorkspace,
    } = useWorkspaceSelector();

    // Define a consistent height class
    const itemHeightClass = "h-10";

    if (isLoading) {
        return (
            <SidebarMenu>
                <SidebarMenuItem>
                    {/* Use the consistent height class for the skeleton */}
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
                        {/* Use the consistent height class for the button */}
                        <SidebarMenuButton
                            size="lg" // Keep size="lg" for padding/font-size etc.
                            className={`${itemHeightClass} data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground`}
                        >
                            <div className="flex flex-col gap-0.5 leading-none">
                                <span className="font-semibold">
                                    {
                                        workspaces.find((ws) => ws.id === selectedWorkspace)?.name || "Select workspace"
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
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

