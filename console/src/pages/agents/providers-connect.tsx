import Page from '@/components/common/page';
import LlmConnect from '@/components/llm-connect';

export default function ProvidersConnectPage() {
  return (
    <Page
      title="Providers"
      isShowButtonGoBack
      className="w-full md:w-2/3 lg:w-1/2 mx-auto"
    >
      <LlmConnect />
    </Page>
  );
}
