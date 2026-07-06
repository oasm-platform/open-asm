import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerGetWorkspaces,
  WorkspaceResponseDtoRole,
  type WorkspaceResponseDto,
} from '@/services/apis/gen/queries';
import { Crown, Plus, Target, Users } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

const PAGE_SIZE = 12;

export default function Workspaces() {
  const navigate = useNavigate();
  const { handleSelectWorkspace } = useWorkspaceSelector();

  const { data, isLoading } = useWorkspacesControllerGetWorkspaces(
    {
      limit: PAGE_SIZE,
      page: 1,
    },
    {
      query: {
        queryKey: ['workspaces'],
      },
    },
  );

  const onSelectWorkspace = (workspaceId: string) => {
    handleSelectWorkspace(workspaceId);
    navigate({ to: '/' });
  };

  return (
    <Page
      title="Workspaces"
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: '/workspaces/create' })}
        >
          <Plus size={16} className="mr-2" />
          New workspace
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4  md:grid-cols-2  lg:grid-cols-3 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: PAGE_SIZE }).map((_, index) => (
                <Card key={index} className="animate-pulse">
                  <CardHeader>
                    <div className="h-5 w-3/4 rounded bg-muted" />
                    <div className="h-4 w-1/2 rounded bg-muted" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 w-full rounded bg-muted" />
                  </CardContent>
                </Card>
              ))
            : (data?.data ?? []).map((workspace: WorkspaceResponseDto) => {
                const isOwner =
                  workspace.role === WorkspaceResponseDtoRole.owner;
                return (
                  <Card
                    key={workspace.id}
                    className="cursor-pointer transition-colors hover:bg-accent/50"
                    onClick={() => onSelectWorkspace(workspace.id)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {workspace.name}
                          {isOwner && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Crown size={20} className="text-yellow-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Owner</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </CardTitle>
                        <Badge
                          className={
                            workspace.archivedAt
                              ? 'bg-gray-500 text-white'
                              : 'bg-green-500 text-white'
                          }
                        >
                          {workspace.archivedAt ? 'Archived' : 'Active'}
                        </Badge>
                      </div>
                      <div className="flex gap-4 pt-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Users size={14} className="text-muted-foreground" />
                          <span className="font-medium">
                            {workspace.memberCount}
                          </span>
                          <span>members</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Target size={14} className="text-muted-foreground" />
                          <span className="font-medium">
                            {workspace.targetCount}
                          </span>
                          <span>targets</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="line-clamp-2">
                        {typeof workspace.description === 'string'
                          ? workspace.description
                          : 'No description'}
                      </CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
        </div>
      </div>
    </Page>
  );
}
