"use client"

import { BriefcaseBusiness, Check, ChevronsUpDown } from "lucide-react"
import * as React from "react"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar'

export function WorkspaceSwitcher({
    versions,
    defaultVersion,
}: {
    versions: string[]
    defaultVersion: string
}) {
    const [selectedVersion, setSelectedVersion] = React.useState(defaultVersion)

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
                        {versions.map((version) => (
                            <DropdownMenuItem
                                key={version}
                                onSelect={() => setSelectedVersion(version)}
                            >
                                v{version}{" "}
                                {version === selectedVersion && <Check className="ml-auto" />}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
