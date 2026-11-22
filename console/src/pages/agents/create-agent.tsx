import Page from '@/components/common/page';
import { useAgentsControllerCreateLLMConfig } from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AgentForm, type AgentFormData } from './components/agent-form';
import { useT } from '@/lib/i18n-dictionary';

export default function CreateAgentPage() {
  const { mutate, isPending } = useAgentsControllerCreateLLMConfig();
  const navigate = useNavigate();
  const t = useT();

  const onSubmit = (data: AgentFormData) => {
    mutate(
      { data },
      {
        onSuccess: () => {
          toast.success(t('agents.provider.connected'));
          navigate({ to: '/aistudio' });
        },
        onError: (error) => {
          toast.error(t('agents.provider.connectFailed'));
          console.error('Error connecting provider:', error);
        },
      },
    );
  };

  return (
    <Page title={t('agents.provider.connectPageTitle')} permission="agent.write">
      <div className="max-w-4xl mx-auto py-6">
        <div className="bg-card rounded-lg border p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">{t('agents.provider.connectTitle')}</h2>
            <p className="text-muted-foreground mt-2">
              {t('agents.provider.connectDescription')}
            </p>
          </div>

          <AgentForm
            onSubmit={onSubmit}
            isPending={isPending}
            submitButtonText={t('agents.provider.connectPageTitle')}
          />
        </div>
      </div>
    </Page>
  );
}
