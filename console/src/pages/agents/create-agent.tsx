import Page from '@/components/common/page';
import { useAgentsControllerCreateLLMConfig } from '@/services/apis/gen/queries';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AgentForm, type AgentFormData } from './agent-form';

export default function CreateAgentPage() {
  const { mutate, isPending } = useAgentsControllerCreateLLMConfig();
  const navigate = useNavigate();

  const onSubmit = (data: AgentFormData) => {
    mutate(
      { data },
      {
        onSuccess: () => {
          toast.success('Provider connected successfully');
          navigate('/agents');
        },
        onError: (error) => {
          toast.error('Failed to connect provider');
          console.error('Error connecting provider:', error);
        },
      },
    );
  };

  return (
    <Page title="Connect Provider" isShowButtonGoBack>
      <div className="max-w-4xl mx-auto py-6">
        <div className="bg-card rounded-lg border p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Connect AI Provider</h2>
            <p className="text-muted-foreground mt-2">
              Configure a new AI provider to enable intelligent security
              analysis and automation.
            </p>
          </div>

          <AgentForm
            onSubmit={onSubmit}
            isPending={isPending}
            submitButtonText="Connect Provider"
          />
        </div>
      </div>
    </Page>
  );
}
