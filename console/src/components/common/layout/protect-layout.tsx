import { AgentSettingsDialog } from '@/components/agent-settings-dialog';
import { ConnectWorkerDialog } from '@/components/ui/connect-worker-dialog';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
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
      {/* AI Studio pages fill the viewport instead of growing the document,
          so they size with flex rather than vh math. */}
      {/* min-w-0: wide tables scroll inside their own container instead of widening the page. */}
      <SidebarInset className={cn('min-w-0', isAiStudio && 'h-svh')}>
        {isAiStudio ? (
          // AI Studio has no app header. On mobile the sidebar trigger floats
          // over the page's top-left corner instead, where the header kept it:
          // a see-through chip, so the page shows under it.
          isHasWorkspace && (
            <SidebarTrigger className="absolute left-4 top-2.5 z-20 size-9 rounded-full border bg-background/60 backdrop-blur-md md:hidden [&_svg:not([class*='size-'])]:size-5" />
          )
        ) : (
          <HeaderBar />
        )}
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
