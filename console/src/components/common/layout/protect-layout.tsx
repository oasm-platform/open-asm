import { AgentSettingsDialog } from '@/components/agent-settings-dialog';
import { AiChatPanel } from '@/components/ai-chat-panel/ai-chat-panel';
import { ConnectWorkerDialog } from '@/components/ui/connect-worker-dialog';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAiChatPanelOpen } from '@/hooks/useAiChatPanel';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { cn } from '@/lib/utils';
import { useLocation } from '@tanstack/react-router';
import { useRef, type ReactNode } from 'react';
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
  // AI Studio is the full-size chat already
  const hasAiChatPanel = isHasWorkspace && !isAiStudio;
  const { state: isAiChatOpen } = useAiChatPanelOpen();
  const isMobile = useIsMobile();
  // The open panel shares the row with the app (mobile opens it full screen)
  const isAiSplit = hasAiChatPanel && isAiChatOpen && !isMobile;
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <SidebarProvider ref={rowRef}>
      {/* The app left of the AI chat panel. While they split the row, it is
          the container the page's breakpoints measure (see index.css). */}
      <div
        data-ai-split={isAiSplit || undefined}
        className={cn('flex min-w-0 flex-1', isAiSplit && '@container/ai-split')}
      >
        {isHasWorkspace && (isAiStudio ? <AiStudioSidebar /> : <AppSidebar />)}
        {/* AI Studio pages fill the viewport instead of growing the document,
            so they size with flex rather than vh math. */}
        {/* min-w-0: wide tables scroll inside their own container instead of widening the page. */}
        {/* app-glow: blue light behind the header and the top of the page */}
        <SidebarInset
          className={cn('min-w-0', isAiStudio ? 'h-svh' : 'app-glow')}
        >
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
      </div>
      {hasAiChatPanel && <AiChatPanel rowRef={rowRef} />}
      <ConnectWorkerDialog />
      <AgentSettingsDialog />
    </SidebarProvider>
  );
}
