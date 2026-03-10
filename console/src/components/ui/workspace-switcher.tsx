import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Separator } from './separator';

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="border">
        <SidebarMenuButton
          size="lg"
          className={`${itemHeightClass} data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground`}
        >
          <div className="flex flex-col gap-0.5 leading-none">
            <span className="font-semibold">
              {workspaces.find((ws) => ws.id === selectedWorkspace)?.name ||
                'Select workspace'}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="min-w-(--radix-dropdown-menu-trigger-width) p-2"
      >
        {workspaces.length > 0 ? (
          <>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onSelect={(event) => {
                  // Prevent default behavior on mobile to ensure proper closing
                  if (isMobile) {
                    event.preventDefault();
                  }
                  handleSelectWorkspace(workspace.id);
                  toast(`Switched to ${workspace.name}`);
                }}
                className="px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between"
              >
                {workspace.name}
                {workspace.id === selectedWorkspace && <Check size={16} />}
              </DropdownMenuItem>
            ))}
            <Separator className="my-1" />
          </>
        ) : (
          <div className="text-center text-sm text-muted-foreground px-2 py-4">
            No workspace
          </div>
        )}

        <DropdownMenuItem onClick={() => navigate('/workspaces')}>
          All workspaces
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/workspaces/create')}>
          <Plus size={16} className="mr-2" />
          Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
