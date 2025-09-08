// src/components/AppBar.tsx

import { GithubBadge } from "@/components/ui/github-badge";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@radix-ui/react-separator";
import type { JSX } from "react";
import { CreateTarget } from "../../ui/create-target";
import { SearchForm } from "../../ui/search-form";
import { WorkspaceSwitcher } from "../../ui/workspace-switcher";

export default function AppBar({ children }: { children: JSX.Element }) {
  return (
    <SidebarInset>
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
        <div className="mr-auto flex gap-3 items-center">
          <SidebarTrigger className="-ml-1" />
          <WorkspaceSwitcher />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
        </div>
        <div className="w-full flex justify-center">
          <SearchForm className="w-1/2" />
        </div>
        <div className="ml-auto flex gap-3">
          <CreateTarget />
          <GithubBadge />
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
    </SidebarInset>
  );
}
