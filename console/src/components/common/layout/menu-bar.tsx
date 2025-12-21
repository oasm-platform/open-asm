import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';

import AppLogo from '@/components/ui/app-logo';
import { GithubBadge } from '@/components/ui/github-badge';
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
import {
  Bug,
  CircleDot,
  CirclePlay,
  CloudCheck,
  Cpu,
  Group,
  LayoutDashboard,
  SquareTerminal,
  Target,
} from 'lucide-react';
import { NavUser } from '../../ui/nav-user';
import { NewBadge } from '../new-badge';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { state, isMobile, setOpenMobile } = useSidebar();

  const menu = [
    {
      title: 'Overview',
      url: '#',
      items: [
        {
          title: 'Dashboard',
          icon: <LayoutDashboard />,
          url: '',
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
          url: 'assets/groups',
          isNew: false,
        },
        {
          title: 'Assets',
          icon: <CloudCheck />,
          url: '/assets',
        },
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
          icon: <SquareTerminal />,
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
  return (
    <Sidebar {...props} collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <AppLogo type="large" />
          <GithubBadge />
        </div>
        {(state === 'expanded' || (state === 'collapsed' && isMobile)) && (
          <WorkspaceSwitcher />
        )}
      </SidebarHeader>
      <SidebarContent className="gap-1 md:gap-3">
        {menu.map((item) => (
          <SidebarGroup key={item.title} className="py-0">
            <SidebarGroupContent>
              <SidebarGroupLabel className="font-bold text-md">
                {item.title}
              </SidebarGroupLabel>
              <SidebarMenu className="gap-0.5">
                {item.items.map((item) => {
                  // Ensure all URLs are absolute for comparison
                  const toUrl = item.url.startsWith('/')
                    ? item.url
                    : `/${item.url}`;
                  const isActive = location.pathname === toUrl;

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className="hover:cursor-pointer"
                      >
                        <Link
                          to={toUrl}
                          onClick={() => setOpenMobile(false)}
                          className="flex items-center justify-start w-full h-full text-base"
                        >
                          {item.icon} {item.title} {item.isNew && <NewBadge />}
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
