import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useAgentsControllerDeleteLLMConfig,
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerSetPreferredLLMConfig,
  type LLMConfigWithProviderDto,
} from '@/services/apis/gen/queries';
import { format } from 'date-fns';
import { Loader2, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  custom: 'Custom',
};

export function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data, isLoading } = useAgentsControllerGetLLMConfigs({
    query: {
      queryKey: ['agents', selectedWorkspaceId],
      enabled: !!id && !!selectedWorkspaceId,
    },
  });

  const { mutate: deleteConfig, isPending: isDeleting } =
    useAgentsControllerDeleteLLMConfig();

  const { mutate: setPreferred, isPending: isSettingPreferred } =
    useAgentsControllerSetPreferredLLMConfig();

  const agent = (data as LLMConfigWithProviderDto[] | undefined)?.find(
    (a) => a.configId === id,
  );

  const handleDelete = () => {
    deleteConfig(
      { id: id || '' },
      {
        onSuccess: () => {
          toast.success('Provider deleted successfully');
          navigate('/agents');
        },
        onError: (error) => {
          toast.error('Failed to delete provider');
          console.error('Error deleting provider:', error);
        },
      },
    );
  };

  const handleSetPreferred = () => {
    setPreferred(
      { id: id || '' },
      {
        onSuccess: () => {
          toast.success('Preferred provider updated');
        },
        onError: (error) => {
          toast.error('Failed to set preferred provider');
          console.error('Error setting preferred:', error);
        },
      },
    );
  };

  const handleEdit = () => {
    navigate(`/agents/${id}/edit`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Provider not found</h2>
        <p className="text-muted-foreground mt-2">
          The provider you&apos;re looking for doesn&apos;t exist or you
          don&apos;t have permission to view it.
        </p>
        <Button className="mt-4" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <Page
      isShowButtonGoBack
      header={
        <div className="flex items-center gap-2 justify-end">
          {!agent.isPreferred && (
            <Button
              variant="outline"
              onClick={handleSetPreferred}
              disabled={isSettingPreferred}
            >
              {isSettingPreferred ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Star className="mr-2 h-4 w-4" />
              )}
              Set Preferred
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="px-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                <span>Edit</span>
              </DropdownMenuItem>
              <ConfirmDialog
                title="Delete Provider"
                description={`Are you sure you want to delete this ${providerLabels[agent.providerId] ?? agent.providerId} configuration? This action cannot be undone.`}
                onConfirm={handleDelete}
                trigger={
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    disabled={isDeleting}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {isDeleting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4 text-red-600" />
                    )}
                    <span className="text-red-600">Delete</span>
                  </DropdownMenuItem>
                }
                confirmText="Delete"
                cancelText="Cancel"
                disabled={isDeleting}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="max-w-4xl mx-auto py-6">
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold">
                {providerLabels[agent.providerId] ?? agent.providerId}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={agent.isPreferred ? 'default' : 'secondary'}>
                  {agent.isPreferred ? 'Preferred' : 'Active'}
                </Badge>
                <span className="text-muted-foreground text-sm">
                  {agent.model}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Provider Type
                </h3>
                <p className="mt-1">
                  {providerLabels[agent.providerId] ?? agent.providerId}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Model
                </h3>
                <p className="mt-1">{agent.model}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  API Key
                </h3>
                <p className="mt-1 font-mono">{agent.apiKeyMasked}</p>
              </div>
              {agent.apiUrl && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">
                    API Endpoint
                  </h3>
                  <p className="mt-1 font-mono text-sm">{agent.apiUrl}</p>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Connected
                </h3>
                <p className="mt-1">
                  {agent.createdAt
                    ? format(new Date(agent.createdAt), 'MMM dd, yyyy HH:mm')
                    : 'N/A'}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Last Updated
                </h3>
                <p className="mt-1">
                  {agent.updatedAt
                    ? format(new Date(agent.updatedAt), 'MMM dd, yyyy HH:mm')
                    : 'N/A'}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Status
                </h3>
                <p className="mt-1">
                  {agent.isPreferred ? 'Preferred Provider' : 'Active'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

export default AgentDetail;
