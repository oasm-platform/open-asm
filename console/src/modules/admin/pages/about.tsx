import Page from '@/components/common/page';
import GetAboutProject from '../components/get-about-project';
import { useT } from '@/lib/i18n-dictionary';

export default function About() {
  const t = useT();
  return (
    <Page
      title={t('admin.about.title')}
      description={t('admin.about.description')}
    >
      <div className="w-full max-w-3xl">
        <GetAboutProject />
      </div>
    </Page>
  );
}
