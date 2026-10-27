import { Link, useLocation } from '@tanstack/react-router';
import * as React from 'react';

import AppLogo from '@/components/ui/app-logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { useSession } from '@/utils/authClient';
import {
  ArrowLeft,
  Bug,
  ChevronDown,
  CirclePlay,
  CloudCheck,
  Cpu,
  FileChartPie,
  FolderOpen,
  Group,
  LayoutDashboard,
  Plug,
  Plus,
  Puzzle,
  Server,
  Sparkles,
  Target,
} from 'lucide-react';
import { NavUser } from '../../ui/nav-user';
import { NewBadge } from '../new-badge';
import {
  sidebarGroupLabelClassName,
  sidebarItemClassName,
  sidebarMenuClassName,
  sidebarSectionPadding,
} from './sidebar-styles';

interface SubMenuItem {
  title: string;
  icon: React.ReactNode;
  url: string;
  isNew?: boolean;
  /** Permission key required to see this item (e.g. 'target.read'). Omit to always show. */
  permission?: string;
}

export interface NavGroup {
  title: string;
  /** Render the group without its label (title still keys the group). */
  hideTitle?: boolean;
  url: string;
  items: SubMenuItem[];
  roles?: string[];
}

export const menu: NavGroup[] = [
  {
    title: 'Overview',
    hideTitle: true,
    url: '#',
    items: [
      {
        title: 'Dashboard',
        icon: <LayoutDashboard />,
        url: '/',
      },
      {
        title: 'AI Studio',
        icon: <Sparkles />,
        url: '/aistudio',
        permission: 'agent.read',
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
        permission: 'target.read',
      },
      {
        title: 'Groups',
        icon: <Group />,
        url: '/groups',
        isNew: false,
        permission: 'group.read',
      },
      {
        title: 'Assets',
        icon: <CloudCheck />,
        url: '/assets',
        permission: 'asset.read',
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
        permission: 'vulnerability.read',
      },
      // {
      //   title: 'Issues',
      //   icon: <CircleDot />,
      //   url: '/issues',
      // },
      {
        title: 'Reports',
        icon: <FileChartPie />,
        url: '/reports',
        permission: 'report.read',
      },
      {
        title: 'Files',
        icon: <FolderOpen />,
        url: '/files',
        permission: 'artifact.read',
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
        title: 'Integrations',
        icon: <Puzzle />,
        url: '/integrations',
        permission: 'integration.read',
      },
      {
        title: 'Workers',
        icon: <Server />,
        url: '/workers',
        permission: 'worker.read',
      },
      {
        title: 'Jobs Registry',
        icon: <CirclePlay />,
        url: '/jobs',
        permission: 'job.read',
      },
    ],
  },
];

// Set after the first sidebar mounts, so later mounts (menu switches) animate.
let hasMountedSidebar = false;

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /** Menu groups to render. Defaults to the main app menu. */
  groups?: NavGroup[];
  /** Primary menu shows the app logo; a secondary menu shows a back button in its place. */
  primary?: boolean;
  /** Show the back button of a secondary menu. Without it, the title links to `backUrl`. */
  isBack?: boolean;
  /** Where the back button navigates to when `primary` is false. */
  backUrl?: string;
  /** Page name shown below the back button when `primary` is false. */
  title?: string;
  /** Show the workspace switcher in the header. */
  showSwitchWorkspace?: boolean;
  /** Extra content rendered after the menu groups (e.g. dynamic lists). */
  children?: React.ReactNode;
}

export function AppSidebar({
  groups = menu,
  primary = true,
  isBack = true,
  backUrl = '/',
  title,
  showSwitchWorkspace = true,
  children,
  ...props
}: AppSidebarProps) {
  const location = useLocation();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { data } = useSession();
  const { hasPermission } = usePermission();
  const { openDialog: openConnectWorker } = useConnectWorkerState();
  // Animate only when switching menus, not on the first page load.
  const [shouldAnimate] = React.useState(() => hasMountedSidebar);
  React.useEffect(() => {
    hasMountedSidebar = true;
  }, []);

  return (
    <Sidebar {...props} collapsible="icon">
      {/* Clips the sliding menu so it doesn't spill over the page. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            shouldAnimate &&
              (primary ? 'sidebar-stack-pop' : 'sidebar-stack-push'),
          )}
        >
          <SidebarHeader className={cn('pt-3', sidebarSectionPadding)}>
            {primary ? (
              <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
                <AppLogo type="large" />
              </div>
            ) : (
              isBack && (
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip="Back"
                      className="h-10 items-center rounded-lg text-[15px] font-semibold hover:cursor-pointer"
                    >
                      <Link
                        to={backUrl}
                        onClick={() => setOpenMobile(false)}
                        className="flex items-center"
                      >
                        <ArrowLeft className="size-5!" />
                        <span>Back</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              )
            )}
            {!primary && title && (
              <h2 className="truncate px-2.5 pt-1 text-lg font-semibold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
                {isBack ? (
                  title
                ) : (
                  <Link
                    to={backUrl}
                    onClick={() => setOpenMobile(false)}
                    className="transition-opacity hover:opacity-80"
                  >
                    {title}
                  </Link>
                )}
              </h2>
            )}
            {showSwitchWorkspace &&
              (state === 'expanded' || (state === 'collapsed' && isMobile)) && (
                <WorkspaceSwitcher />
              )}
          </SidebarHeader>
          <SidebarContent className={cn('gap-3 py-2', sidebarSectionPadding)}>
            {primary && (
              <SidebarMenu>
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Create"
                        className="h-9 rounded-lg border border-border/60 px-2.5 text-[13px] font-medium hover:cursor-pointer"
                      >
                        <Plus />
                        <span>Create</span>
                        <ChevronDown className="ml-auto group-data-[collapsible=icon]:hidden" />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side={isMobile ? 'bottom' : 'right'}
                      align="start"
                    >
                      <DropdownMenuItem asChild>
                        <Link
                          to="/targets/start-discovery"
                          onClick={() => setOpenMobile(false)}
                        >
                          <Target />
                          Target
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          to="/groups/create"
                          onClick={() => setOpenMobile(false)}
                        >
                          <Group />
                          Group
                        </Link>
                      </DropdownMenuItem>
                      {/* Join keys require workspace.apikey on the API. */}
                      {hasPermission('workspace.apikey') && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenMobile(false);
                            openConnectWorker();
                          }}
                        >
                          <Plug />
                          Connect worker
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              </SidebarMenu>
            )}
            {groups
              .map((group) => ({
                ...group,
                items: group.items.filter(
                  (sub) => !sub.permission || hasPermission(sub.permission),
                ),
              }))
              .filter(
                (group) =>
                  group.items.length > 0 &&
                  (!group.roles ||
                    group.roles.length === 0 ||
                    (data?.user.role != null &&
                      group.roles.includes(data.user.role))),
              )
              .map((group) => (
                <SidebarGroup key={group.title} className="p-0">
                  <SidebarGroupContent>
                    {!group.hideTitle && (
                      <SidebarGroupLabel
                        className={cn(
                          sidebarGroupLabelClassName,
                          'group-data-[collapsible=icon]:-mt-7',
                        )}
                      >
                        {group.title}
                      </SidebarGroupLabel>
                    )}
                    <SidebarMenu className={sidebarMenuClassName}>
                      {group.items.map((item) => {
                        // Ensure all URLs are absolute for comparison
                        const toUrl = item.url;
                        const isActive =
                          toUrl === '/'
                            ? location.pathname === '/'
                            : location.pathname === toUrl ||
                              location.pathname.startsWith(toUrl + '/');
                        return (
                          <SidebarMenuItem
                            key={item.title}
                            className="relative"
                          >
                            <SidebarMenuButton
                              asChild
                              isActive={isActive}
                              tooltip={item.title}
                              className={cn('group', sidebarItemClassName)}
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
            {children}
          </SidebarContent>
        </div>
      </div>
      <SidebarRail />
      <SidebarFooter className={cn('pb-3', sidebarSectionPadding)}>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
