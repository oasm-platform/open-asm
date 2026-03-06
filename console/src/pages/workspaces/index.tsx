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
  useWorkspacesControllerGetWorkspaces,
  type Workspace,
} from '@/services/apis/gen/queries';
import { setGlobalWorkspaceId } from '@/utils/workspaceState';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PAGE_SIZE = 12;

export default function Workspaces() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const handleSelectWorkspace = (workspaceId: string) => {
    setGlobalWorkspaceId(workspaceId);
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== 'global',
    });
    navigate('/');
  };

  return (
    <Page
      title="Workspaces"
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/workspaces/create')}
        >
          <Plus size={16} className="mr-2" />
          New workspace
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
            : data?.data.map((workspace: Workspace) => (
                <Card
                  key={workspace.id}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() => handleSelectWorkspace(workspace.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">
                        {workspace.name}
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
                    <CardDescription className="line-clamp-2">
                      {workspace.description || 'No description'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent></CardContent>
                </Card>
              ))}
        </div>
      </div>
    </Page>
  );
}
