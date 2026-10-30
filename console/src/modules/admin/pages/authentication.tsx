import Page from '@/components/common/page';
import AuthenticationSettings from '../components/authentication-settings';

export default function Authentication() {
  return (
    <Page
      title="Authentication"
      description="How people get an account on this platform"
    >
      <div className="w-full max-w-3xl">
        <AuthenticationSettings />
      </div>
    </Page>
  );
}
