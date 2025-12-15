// src/components/AppBar.tsx

import { AssistantChat } from '@/assistant/assistant-chat';
import { NotificationBell } from '@/components/notifications/notification-bell';
import AppLogo from '@/components/ui/app-logo';
import {
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import type { JSX } from 'react';
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
          <AssistantChat />
          <NotificationBell />
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
    </SidebarInset>
  );
}
