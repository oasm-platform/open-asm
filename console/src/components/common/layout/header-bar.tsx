// HeaderBar - Sticky header component without children wrapper

import { NotificationBell } from '@/components/notifications/notification-bell';
import AppLogo from '@/components/ui/app-logo';
import { NavUser } from '@/components/ui/nav-user';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { SearchForm } from '../../ui/search-form';
import { ThemeSwitch } from '@/components/ui/theme-switch-icon';

export function HeaderBar() {
  const { isMobile } = useSidebar();
  const { workspaces } = useWorkspaceSelector();
  const isHasWorkspace = workspaces?.length > 0;
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
      {isHasWorkspace ? (
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="max-md:scale-125" />
            {isMobile && <AppLogo type="small" />}
          </div>
          <div className="flex flex-1 justify-center">
            <SearchForm className="w-full max-w-xl" />
          </div>
          <div className="flex items-center gap-1">
            <ThemeSwitch />
            <NotificationBell />
          </div>
        </div>
      ) : (
        <div className="flex w-full items-center justify-end gap-2">
          <AppLogo type="small" />
          <div className="ml-auto">
            <NavUser isOnlyAvatar dropdownSide="bottom" />
          </div>
        </div>
      )}
    </header>
  );
}
