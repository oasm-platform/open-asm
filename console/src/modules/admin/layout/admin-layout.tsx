import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Briefcase, Info, KeyRound, Mail, Palette, User } from 'lucide-react';
import type { JSX, ReactNode } from 'react';
import { type TFunction, useT } from '@/lib/i18n-dictionary';
import { HeaderBar } from '@/components/common/layout/header-bar';
import { AppSidebar, type NavGroup } from '@/components/common/layout/menu-bar';

interface AdminLayoutProps {
  children: ReactNode;
}

const adminMenu = (t: TFunction): NavGroup[] => [
  {
    title: t('admin.nav.platform'),
    url: '#',
    roles: ['admin'],
    items: [
      {
        title: t('admin.nav.users'),
        icon: <User />,
        url: '/admin/users',
      },
      {
        title: t('admin.nav.workspaces'),
        icon: <Briefcase />,
        url: '/admin/workspaces',
      },
    ],
  },
  {
    title: t('admin.nav.system'),
    url: '#',
    roles: ['admin'],
    items: [
      {
        title: t('admin.nav.brand'),
        icon: <Palette />,
        url: '/admin/brand',
      },
      {
        title: t('admin.nav.authentication'),
        icon: <KeyRound />,
        url: '/admin/authentication',
      },
      {
        title: t('admin.nav.mailServer'),
        icon: <Mail />,
        url: '/admin/mail-server',
      },
      {
        title: t('admin.nav.about'),
        icon: <Info />,
        url: '/admin/about',
      },
    ],
  },
];

export default function AdminLayout({
  children,
}: AdminLayoutProps): JSX.Element {
  const t = useT();
  return (
    <SidebarProvider>
      <AppSidebar
        groups={adminMenu(t)}
        primary={false}
        title={t('admin.nav.title')}
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
