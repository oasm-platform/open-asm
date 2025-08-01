import * as React from "react";
import { Link, useLocation } from "react-router-dom";

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail
} from "@/components/ui/sidebar";
import { CloudCheck, LayoutDashboard, Radar, ShoppingCart, SquareTerminal, Target } from "lucide-react";
import { NavUser } from "../../ui/nav-user";

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
                    title: "Marketplaces",
                    icon: <ShoppingCart />,
                    url: "/marketplaces",
                },
                {
                    title: "Targets",
                    icon: <Target />,
                    url: "/targets",
                },
                {
                    title: "Assets",
                    icon: <CloudCheck />,
                    url: "/assets",
                },


            ],
        },
        {
            title: "Management (admin)",
            url: "#",
            items: [
                {
                    title: "Workers",
                    icon: <SquareTerminal />,
                    url: "/workers",
                },
            ],
        },
    ];
    return (
        <Sidebar {...props}>
            <SidebarHeader>
                <div className="flex h-13 justify-start items-center gap-3">
                    <Radar size={40} />
                    <b className="text-lg">OASM</b>
                </div>
            </SidebarHeader>
            <SidebarContent>
                {menu.map((item) => (
                    <SidebarGroup key={item.title}>
                        <SidebarGroupContent>
                            <SidebarGroupLabel>{item.title}</SidebarGroupLabel>
                            <SidebarMenu>
                                {item.items.map((item) => {
                                    // Ensure all URLs are absolute for comparison
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
