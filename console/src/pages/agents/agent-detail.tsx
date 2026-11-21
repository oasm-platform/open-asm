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
import { useLLMConfigs } from '@/hooks/use-llm-configs';
import { format } from 'date-fns';
import { Loader2, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useT } from '@/lib/i18n-dictionary';

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export function AgentDetail() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { providers, isLoading, deleteConfig, setPreferredConfig } = useLLMConfigs({
    enabled: !!id && !!selectedWorkspaceId,
  });

  const agent = providers.find((a) => a.configId === id);
  const providerLabel = (providerId: string) =>
    providerId === 'custom'
      ? t('agents.form.custom')
      : (providerLabels[providerId] ?? providerId);
  const isDeleting = deleteConfig.isPending;
  const isSettingPreferred = setPreferredConfig.isPending;

  const handleDelete = () => {
    deleteConfig.mutate(
      { id: id || '' },
      {
        onSuccess: () => {
          toast.success(t('agents.provider.deleted'));
          navigate({ to: '/aistudio' });
        },
        onError: (error) => {
          toast.error(t('agents.provider.deleteFailed'));
          console.error('Error deleting provider:', error);
        },
      },
    );
  };

  const handleSetPreferred = () => {
    setPreferredConfig.mutate(
      { id: id || '' },
      {
        onSuccess: () => {
          toast.success(t('agents.provider.preferredUpdated'));
        },
        onError: (error) => {
          toast.error(t('agents.provider.preferredFailed'));
          console.error('Error setting preferred:', error);
        },
      },
    );
  };

  const handleEdit = () => {
    navigate({ to: `/agents/${id}/edit` });
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
        <h2 className="text-xl font-semibold">{t('agents.provider.notFound')}</h2>
        <p className="text-muted-foreground mt-2">
          {t('agents.provider.notFoundDescription')}
        </p>
        <Button className="mt-4" onClick={() => window.history.back()}>
          {t('agents.provider.goBack')}
        </Button>
      </div>
    );
  }

  return (
    <Page
      permission="agent.read"
     
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
              {t('agents.provider.setPreferred')}
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
                <span>{t('common.edit')}</span>
              </DropdownMenuItem>
              <ConfirmDialog
                title={t('agents.provider.deleteTitle')}
                description={t('agents.provider.deleteDescription', { provider: providerLabel(agent.providerId) })}
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
                    <span className="text-red-600">{t('common.delete')}</span>
                  </DropdownMenuItem>
                }
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
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
                {providerLabel(agent.providerId)}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={agent.isPreferred ? 'default' : 'secondary'}>
                  {agent.isPreferred ? t('agents.provider.preferred') : t('agents.provider.active')}
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
                  {t('agents.provider.type')}
                </h3>
                <p className="mt-1">
                  {providerLabel(agent.providerId)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('agents.provider.model')}
                </h3>
                <p className="mt-1">{agent.model}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('agents.provider.apiKey')}
                </h3>
                <p className="mt-1 font-mono">{agent.apiKeyMasked}</p>
              </div>
              {agent.apiUrl && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {t('agents.provider.apiEndpoint')}
                  </h3>
                  <p className="mt-1 font-mono text-sm">{agent.apiUrl}</p>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('agents.provider.connectedAt')}
                </h3>
                <p className="mt-1">
                  {agent.createdAt
                    ? format(new Date(agent.createdAt), 'MMM dd, yyyy HH:mm')
                    : t('agents.provider.notAvailable')}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('agents.provider.lastUpdated')}
                </h3>
                <p className="mt-1">
                  {agent.updatedAt
                    ? format(new Date(agent.updatedAt), 'MMM dd, yyyy HH:mm')
                    : t('agents.provider.notAvailable')}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('common.status')}
                </h3>
                <p className="mt-1">
                  {agent.isPreferred ? t('agents.provider.preferredProvider') : t('agents.provider.active')}
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
