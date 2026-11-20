import Page from '@/components/common/page';
import MailServerSettings from '../components/mail-server-settings';
import { useT } from '@/lib/i18n-dictionary';

export default function MailServer() {
  const t = useT();
  return (
    <Page
      title={t('admin.mailServer.title')}
      description={t('admin.mailServer.description')}
    >
      <div className="w-full max-w-3xl">
        <MailServerSettings />
      </div>
    </Page>
  );
}
