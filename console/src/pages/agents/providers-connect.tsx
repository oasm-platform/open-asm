import Page from '@/components/common/page';
import LlmConnect from '@/components/llm-connect';
import { useNavigate } from 'react-router-dom';

export default function ProvidersConnectPage() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    // Navigate back to agents landing after successful connection
    void navigate('/agents');
  };

  return (
    <Page
      title="LLM providers"
      isShowButtonGoBack
      className="w-full md:w-2/3 lg:w-1/2 mx-auto"
    >
      <LlmConnect onSuccess={handleSuccess} />
    </Page>
  );
}
