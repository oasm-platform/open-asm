import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { ChevronsUpDown, GalleryVerticalEnd, Plus } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

export function WorkspaceSwitcher() {
  const { workspaces, isLoading, selectedWorkspace, handleSelectWorkspace } =
    useWorkspaceSelector();
  const isMobile = useIsMobile();

  const itemHeightClass = 'h-10';
  const navigate = useNavigate();
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
                  {workspaces.find((ws) => ws.id === selectedWorkspace)?.name ||
                    'Select workspace'}
                </span>
                {/*<span className="truncate text-xs">{activeTeam.plan}</span>*/}
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
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Workspace
            </DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.name}
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
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
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
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
