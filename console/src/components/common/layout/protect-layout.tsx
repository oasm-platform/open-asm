import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import type { ReactNode } from 'react';
import { HeaderBar } from './header-bar';
import { AppSidebar } from './menu-bar';

interface ProtectedLayoutProps {
  children: ReactNode;
}

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const { workspaces } = useWorkspaceSelector();
  const isHasWorkspace = workspaces?.length > 0;
  return (
    <SidebarProvider>
      {isHasWorkspace && <AppSidebar />}
      <SidebarInset>
        <HeaderBar />
        <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
