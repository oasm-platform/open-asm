// src/components/AppBar.tsx

import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import ThemeModeSwitcher from "@/components/ui/theme-mode-switcher";
import { Separator } from "@radix-ui/react-separator";
import type { JSX } from "react";
import { CreateTarget } from "../create-target";

export default function AppBar({ children }: { children: JSX.Element }) {
    return (
        <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator
                    orientation="vertical"
                    className="mr-2 data-[orientation=vertical]:h-4"
                />
                <div className="ml-auto flex gap-3">
                    <CreateTarget />
                    <ThemeModeSwitcher />
                </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 p-4">
                {children}
            </div>
        </SidebarInset>
    )
}
