import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { settingsTabGroups } from '@/pages/settings/settings';
import type { JSX, ReactNode } from 'react';
import { HeaderBar } from './header-bar';
import { AppSidebar, type NavGroup } from './menu-bar';

interface SettingsLayoutProps {
  children: ReactNode;
}

// Settings tab groups in the shape the shared sidebar expects.
// Permission/role filtering is done by AppSidebar.
const settingsMenu: NavGroup[] = settingsTabGroups.map((group) => ({
  title: group.name,
  url: '#',
  roles: group.roles,
  items: group.tabs.map((tab) => ({
    title: tab.label,
    icon: tab.icon,
    url: tab.path,
    permission: tab.permission,
  })),
}));

export default function SettingsLayout({
  children,
}: SettingsLayoutProps): JSX.Element {
  return (
    <SidebarProvider>
      <AppSidebar
        groups={settingsMenu}
        primary={false}
        title="Settings"
        showSwitchWorkspace
      />
      <SidebarInset>
        {/* Mobile keeps the header: it holds the only sidebar trigger there. */}
        <HeaderBar className="md:hidden" />
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
