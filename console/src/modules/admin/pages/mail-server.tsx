import Page from '@/components/common/page';
import MailServerSettings from '../components/mail-server-settings';

export default function MailServer() {
  return (
    <Page
      title="Mail server"
      description="How the platform sends email, such as sign-up verification"
    >
      <div className="w-full max-w-3xl">
        <MailServerSettings />
      </div>
    </Page>
  );
}
