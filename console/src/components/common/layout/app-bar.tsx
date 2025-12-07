// src/components/AppBar.tsx

import AppLogo from '@/components/ui/app-logo';
import { GithubBadge } from '@/components/ui/github-badge';
import {
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import type { JSX } from 'react';
import { CreateTarget } from '../../ui/create-target';
import { SearchForm } from '../../ui/search-form';

export default function AppBar({ children }: { children: JSX.Element }) {
  const { isMobile } = useSidebar();
  return (
    <SidebarInset>
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
        <div className="mr-auto flex gap-3 items-center">
          <SidebarTrigger />
          {isMobile && <AppLogo type="small" />}
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
