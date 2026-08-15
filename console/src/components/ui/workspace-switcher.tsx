import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePermission } from '@/hooks/usePermission';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { ChevronsUpDown, Check, Crown, GalleryVerticalEnd, Plus, UserPlus } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sessionQueryOptions } from '@/utils/authClient';

export function WorkspaceSwitcher() {
  const { workspaces, isLoading, selectedWorkspace, handleSelectWorkspace } =
    useWorkspaceSelector();
  const { hasPermission } = usePermission();
  const isMobile = useIsMobile();
  const { data: session } = useQuery(sessionQueryOptions);
  const currentUserId = session?.user?.id;

  const itemHeightClass = 'h-10';
  const navigate = useNavigate();
  const currentWorkspace = workspaces.find((ws) => ws.id === selectedWorkspace);
  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <Skeleton className={`${itemHeightClass} w-full`} />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">
                  {currentWorkspace?.name || 'Select workspace'}
                </span>
              </div>
              <ChevronsUpDown className="ms-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {currentWorkspace?.name || 'Select workspace'}
                </span>
                {currentWorkspace?.ownerId === currentUserId && (
                  <Crown className="size-4 shrink-0 text-amber-500" />
                )}
              </div>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {currentWorkspace
                  ? `${currentWorkspace.memberCount} member${currentWorkspace.memberCount === 1 ? '' : 's'}`
                  : ''}
              </span>
            </div>
            <DropdownMenuSeparator />
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onSelect={(e) => {
                  if (isMobile) {
                    e.preventDefault();
                  }
                  handleSelectWorkspace(workspace.id);
                  toast('Switched to ' + workspace.name);
                  navigate({ to: '/' });
                }}
                className="gap-2 p-2"
              >
                {workspace.name}
                {workspace.id === selectedWorkspace && (
                  <Check className="ms-auto size-4" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {hasPermission('invitation.write') && (
              <DropdownMenuItem
                className="gap-2 p-2"
                onSelect={() =>
                  navigate({
                    to: '/settings/$tab',
                    params: { tab: 'members' },
                    search: { tab: 'members', invite: true },
                  })
                }
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <UserPlus className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">
                  Invite members
                </div>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2"
              onClick={() => navigate({ to: '/workspaces/create' })}
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">
                Add workspace
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 p-2"
              onClick={() => navigate({ to: '/workspaces' })}
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <GalleryVerticalEnd className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">
                All workspaces
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
