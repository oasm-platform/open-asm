// HeaderBar - Sticky header component without children wrapper

import { AssistantChat } from '@/assistant/assistant-chat';
import { NotificationBell } from '@/components/notifications/notification-bell';
import AppLogo from '@/components/ui/app-logo';
import { NavUser } from '@/components/ui/nav-user';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';
import { SearchForm } from '../../ui/search-form';

export function HeaderBar() {
  const { isMobile } = useSidebar();
  const { data: metadata } = useRootControllerGetMetadata();
  const isAssistantEnabled = metadata?.isAssistant ?? false;
  const { workspaces } = useWorkspaceSelector();
  const isHasWorkspace = workspaces?.length > 0;
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
      {isHasWorkspace ? (
        <div className="flex w-full items-center justify-between">
          <div className="mr-auto flex gap-3 items-center">
            <SidebarTrigger />
            {isMobile && <AppLogo type="small" />}
          </div>
          <div className="w-full flex justify-center">
            <SearchForm className="w-1/2" />
          </div>
          <div className="ml-auto flex gap-3 items-center">
            {isAssistantEnabled && <AssistantChat />}
            <NotificationBell />
          </div>
        </div>
      ) : (
        <div className="flex justify-end w-full">
          <AppLogo type="small" />
          <div className="ml-auto">
            <NavUser isOnlyAvatar dropdownSide="bottom" />
          </div>
        </div>
      )}
    </header>
  );
}
