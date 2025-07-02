import * as React from "react";
import { Link, useLocation } from "react-router-dom";

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail
} from "@/components/ui/sidebar";
import { LayoutDashboard, Target } from "lucide-react";
import { NavUser } from "../nav-user";
import { WorkspaceSwitcher } from "../workspace-switcher";
import { SearchForm } from "./search-form";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const location = useLocation();

    const menu = [
        {
            title: "Overview",
            url: "#",
            items: [
                {
                    title: "Dashboard",
                    icon: <LayoutDashboard />,
                    url: "",
                },
                {
                    title: "Targets",
                    icon: <Target />,
                    url: "/targets",
                },
            ],
        },
    ];
    return (
        <Sidebar {...props}>
            <SidebarHeader>
                <WorkspaceSwitcher />
                <SearchForm />
            </SidebarHeader>
            <SidebarContent>
                {menu.map((item) => (
                    <SidebarGroup key={item.title}>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {item.items.map((item) => {
                                    const toUrl = item.url.startsWith("/") ? item.url : `/${item.url}`;
                                    const isActive = location.pathname === toUrl;

                                    return (
                                        <SidebarMenuItem key={item.title}>
                                            <SidebarMenuButton
                                                asChild
                                                isActive={isActive}
                                                className="hover:cursor-pointer"
                                            >
                                                <Link
                                                    to={toUrl}
                                                    className="flex items-center justify-start gap-2 w-full h-full"
                                                >
                                                    {item.icon} {item.title}
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>
            <SidebarRail />
            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
