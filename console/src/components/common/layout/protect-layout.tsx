import {
    SidebarProvider
} from "@/components/ui/sidebar"
import type { JSX } from "react"
import AppBar from "./app-bar"
import { AppSidebar } from "./app-side-bar"

export default function ProtectedLayout({ children }: { children: JSX.Element }) {
    return (
        <SidebarProvider>
            <AppSidebar />
            <AppBar>
                {children}
            </AppBar>
        </SidebarProvider>
    )
}
