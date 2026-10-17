import { AgentSettingsDialog } from '@/components/agent-settings-dialog';
import { ConnectWorkerDialog } from '@/components/ui/connect-worker-dialog';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { cn } from '@/lib/utils';
import { useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AiStudioSidebar } from './ai-studio-sidebar';
import { HeaderBar } from './header-bar';
import { AppSidebar } from './menu-bar';

interface ProtectedLayoutProps {
  children: ReactNode;
}

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const { workspaces } = useWorkspaceSelector();
  const { pathname } = useLocation();
  const isHasWorkspace = workspaces?.length > 0;
  const isAiStudio =
    pathname === '/aistudio' || pathname.startsWith('/aistudio/');
  return (
    <SidebarProvider>
      {isHasWorkspace && (isAiStudio ? <AiStudioSidebar /> : <AppSidebar />)}
      {/* AI Studio pages fill the viewport below the header instead of
          growing the document, so they size with flex rather than vh math. */}
      <SidebarInset className={cn(isAiStudio && 'h-svh')}>
        {/* Mobile keeps the header: it holds the only sidebar trigger there. */}
        <HeaderBar className={cn(isAiStudio && 'md:hidden')} />
        <main
          className={cn(
            'flex flex-1 flex-col gap-4 p-4 md:p-6',
            isAiStudio && 'min-h-0 overflow-y-auto',
          )}
        >
          {children}
        </main>
      </SidebarInset>
      <ConnectWorkerDialog />
      <AgentSettingsDialog />
    </SidebarProvider>
  );
}
