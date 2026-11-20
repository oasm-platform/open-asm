import Page from '@/components/common/page';
import AdminAccessSettings from '../components/admin-access-settings';
import AuthenticationSettings from '../components/authentication-settings';
import { useT } from '@/lib/i18n-dictionary';

export default function Authentication() {
  const t = useT();
  return (
    <Page
      title={t('admin.authentication.title')}
      description={t('admin.authentication.description')}
    >
      <div className="w-full max-w-3xl space-y-4">
        <AuthenticationSettings />
        <AdminAccessSettings />
      </div>
    </Page>
  );
}
