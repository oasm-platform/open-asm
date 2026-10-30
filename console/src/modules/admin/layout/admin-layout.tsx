import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Briefcase, Info, KeyRound, Mail, Palette, User } from 'lucide-react';
import type { JSX, ReactNode } from 'react';
import { HeaderBar } from '@/components/common/layout/header-bar';
import { AppSidebar, type NavGroup } from '@/components/common/layout/menu-bar';

interface AdminLayoutProps {
  children: ReactNode;
}

const adminMenu: NavGroup[] = [
  {
    title: 'Platform',
    url: '#',
    roles: ['admin'],
    items: [
      {
        title: 'Users',
        icon: <User />,
        url: '/admin/users',
      },
      {
        title: 'Workspaces',
        icon: <Briefcase />,
        url: '/admin/workspaces',
      },
    ],
  },
  {
    title: 'System',
    url: '#',
    roles: ['admin'],
    items: [
      {
        title: 'Brand name and logo',
        icon: <Palette />,
        url: '/admin/brand',
      },
      {
        title: 'Authentication',
        icon: <KeyRound />,
        url: '/admin/authentication',
      },
      {
        title: 'Mail server',
        icon: <Mail />,
        url: '/admin/mail-server',
      },
      {
        title: 'About',
        icon: <Info />,
        url: '/admin/about',
      },
    ],
  },
];

export default function AdminLayout({
  children,
}: AdminLayoutProps): JSX.Element {
  return (
    <SidebarProvider>
      <AppSidebar
        groups={adminMenu}
        primary={false}
        title="Admin"
        showSwitchWorkspace={false}
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
