import Page from '@/components/common/page';
import AdminAccessSettings from '../components/admin-access-settings';
import AuthenticationSettings from '../components/authentication-settings';

export default function Authentication() {
  return (
    <Page
      title="Authentication"
      description="How people get an account and where admins sign in from"
    >
      <div className="w-full max-w-3xl space-y-4">
        <AuthenticationSettings />
        <AdminAccessSettings />
      </div>
    </Page>
  );
}
