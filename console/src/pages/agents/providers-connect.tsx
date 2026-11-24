import Page from '@/components/common/page';
import LlmConnect from '@/pages/agents/components/llm-connect';
import { useT } from '@/lib/i18n-dictionary';

export default function ProvidersConnectPage() {
  const t = useT();
  return (
    <Page
      title={t('agents.providers.title')}
      className="w-full md:w-2/3 lg:w-1/2 mx-auto"
      permission="agent.write"
    >
      <LlmConnect />
    </Page>
  );
}
