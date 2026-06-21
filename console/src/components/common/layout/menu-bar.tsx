import { Link, useLocation } from '@tanstack/react-router';
import * as React from 'react';

import AppLogo from '@/components/ui/app-logo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '@/components/ui/workspace-switcher';
import { useSession } from '@/utils/authClient';
import {
  Bug,
  CircleDot,
  CirclePlay,
  CloudCheck,
  Cpu,
  FileChartPie,
  Group,
  LayoutDashboard,
  Server,
  Sparkles,
  Target,
  User,
} from 'lucide-react';
import { NavUser } from '../../ui/nav-user';
import { NewBadge } from '../new-badge';

interface SubMenuItem {
  title: string;
  icon: React.ReactNode;
  url: string;
  isNew?: boolean;
}

interface NavGroup {
  title: string;
  url: string;
  items: SubMenuItem[];
  roles?: string[];
}

export const menu: NavGroup[] = [
  {
    title: 'Overview',
    url: '#',
    items: [
      {
        title: 'Dashboard',
        icon: <LayoutDashboard />,
        url: '/',
      },
      {
        title: 'New Chat',
        icon: <Sparkles />,
        url: '/agents',
      },
    ],
  },
  {
    title: 'Admin',
    url: '#',
    roles: ['admin'],
    items: [
      {
        title: 'Users',
        icon: <User />,
        url: '/admin/users',
      },
    ],
  },
  {
    title: 'Attack surface',
    url: '#',
    items: [
      {
        title: 'Targets',
        icon: <Target />,
        url: '/targets',
      },
      {
        title: 'Groups',
        icon: <Group />,
        url: '/groups',
        isNew: false,
      },
      {
        title: 'Assets',
        icon: <CloudCheck />,
        url: '/assets',
      },
      // {
      //   title: 'Internal networks',
      //   icon: <GlobeLock />,
      //   url: '/internal-networks',
      // },
    ],
  },
  {
    title: 'Security',
    url: '#',
    items: [
      {
        title: 'Vulnerabilities',
        icon: <Bug />,
        url: '/vulnerabilities',
      },
      {
        title: 'Issues',
        icon: <CircleDot />,
        url: '/issues',
      },
      {
        title: 'Reports',
        icon: <FileChartPie />,
        url: '/reports',
        isNew: true,
      },
    ],
  },

  {
    title: 'Management',
    url: '#',
    items: [
      {
        title: 'Tools',
        icon: <Cpu />,
        url: '/tools',
      },
      {
        title: 'Workers',
        icon: <Server />,
        url: '/workers',
      },
      {
        title: 'Jobs Registry',
        icon: <CirclePlay />,
        url: '/jobs',
      },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { data } = useSession();

  return (
    <Sidebar {...props} collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between px-2">
          <AppLogo type="large" />
        </div>
        {(state === 'expanded' || (state === 'collapsed' && isMobile)) && (
          <WorkspaceSwitcher />
        )}
      </SidebarHeader>
      <SidebarContent className="gap-1 px-2 py-2 md:gap-4">
        {menu
          .filter(
            (item) =>
              !item.roles ||
              item.roles.length === 0 ||
              (data?.user.role != null && item.roles.includes(data.user.role)),
          )
          .map((item) => (
            <SidebarGroup key={item.title} className="p-0">
              <SidebarGroupContent>
                <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                  {item.title}
                </SidebarGroupLabel>
                <SidebarMenu className="mt-1 gap-0.5">
                  {item.items.map((item) => {
                    // Ensure all URLs are absolute for comparison
                    const toUrl = item.url;
                    const isActive =
                      toUrl === '/'
                        ? location.pathname === '/'
                        : location.pathname === toUrl ||
                          location.pathname.startsWith(toUrl + '/');
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.title}
                          className="h-9 rounded-lg text-[13px] font-medium hover:cursor-pointer data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
                        >
                          <Link
                            to={toUrl}
                            onClick={() => setOpenMobile(false)}
                            className="flex w-full items-center justify-start"
                          >
                            {item.icon}{' '}
                            <span className="truncate">{item.title}</span>
                            {item.isNew && (
                              <span className="ml-auto">
                                <NewBadge />
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
      </SidebarContent>
      <SidebarRail />
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
