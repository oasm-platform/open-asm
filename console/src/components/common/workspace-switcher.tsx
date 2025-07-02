"use client"

import { BriefcaseBusiness, Check, ChevronsUpDown } from "lucide-react"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useWorkspacesControllerGetWorkspaces } from "@/services/apis/gen/queries"
import { DropdownMenuItem } from "@radix-ui/react-dropdown-menu"
import React from "react"

export function WorkspaceSwitcher() {
    const [selectedWorkspace, setSelectedWorkspace] = React.useState<string | null>()
    const { data: response, isLoading } = useWorkspacesControllerGetWorkspaces({ limit: 100, page: 1 })
    if (isLoading) {
        return null
    }


    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                                <BriefcaseBusiness className="size-4" />
                            </div>
                            <div className="flex flex-col gap-0.5 leading-none">
                                <span className="font-semibold">My workspace</span>
                            </div>
                            <ChevronsUpDown className="ml-auto" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-[--radix-dropdown-menu-trigger-width]"
                        align="start"
                    >
                        {response?.data?.map((workspace) => (
                            <DropdownMenuItem
                                key={workspace.id as any}
                                onSelect={() => setSelectedWorkspace(workspace.id)}
                            >
                                {workspace?.name}
                                {workspace.id === selectedWorkspace && <Check className="ml-auto" />}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
