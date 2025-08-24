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
import CreateWorkspace from "@/pages/workspaces/create-workspace-dialog";
import { DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { Separator } from "./separator";

export function WorkspaceSwitcher() {
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
        <SidebarMenu className="w-48">
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
                                        onSelect={() => {
                                            handleSelectWorkspace(workspace.id)
                                            toast(`Switched to ${workspace.name}`)
                                        }}
                                        className="cursor-pointer px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between"
                                    >
                                        {workspace.name}
                                        {workspace.id === selectedWorkspace && <Check size={16} />}
                                    </DropdownMenuItem>
                                ))}
                                <Separator className="my-1" />
                            </>
                        ) : (
                            <div className="text-center text-sm text-muted-foreground px-2 py-4">
                                No workspace
                            </div>
                        )}

                        <CreateWorkspace />
                    </DropdownMenuContent>

                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
