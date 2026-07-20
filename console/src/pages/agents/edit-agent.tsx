import { useLLMConfigs } from '@/hooks/use-llm-configs';
import Page from '@/components/common/page';
import type { UpdateLLMConfigDto } from '@/services/apis/gen/queries';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AgentForm, type AgentFormData } from './components/agent-form';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';

export default function EditAgentPage() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const {
    providers,
    isLoading,
    invalidate,
    updateConfig,
  } = useLLMConfigs({
    enabled: !!id && !!selectedWorkspaceId,
  });

  const { mutate, isPending } = updateConfig;

  const agent = providers.find((a) => a.configId === id);

  const onSubmit = (formData: AgentFormData) => {
    const updateData: UpdateLLMConfigDto = {
      model: formData.model,
    };

    if (formData.apiKey) {
      updateData.apiKey = formData.apiKey;
    }

    if (formData.apiUrl) {
      updateData.apiUrl = formData.apiUrl;
    }

    mutate(
      {
        id: id || '',
        data: updateData,
      },
      {
        onSuccess: () => {
          invalidate();
          toast.success('Provider updated successfully');
          navigate({ to: `/agents/${id}` });
        },
        onError: (error) => {
          toast.error('Failed to update provider');
          console.error('Error updating provider:', error);
        },
      },
    );
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
        <button
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded"
          onClick={() => window.history.back()}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <Page title="Edit Provider" isShowButtonGoBack>
      <div className="max-w-4xl mx-auto py-6">
        <div className="bg-card rounded-lg border p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Edit AI Provider</h2>
            <p className="text-muted-foreground mt-2">
              Update the provider configuration.
            </p>
          </div>

          <AgentForm
            onSubmit={onSubmit}
            isPending={isPending}
            initialData={{
              provider: agent.providerId,
              model: agent.model ?? '',
              apiUrl: agent.apiUrl,
            }}
            submitButtonText="Update Provider"
            isEdit
          />
        </div>
      </div>
    </Page>
  );
}
