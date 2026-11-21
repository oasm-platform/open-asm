import Page from '@/components/common/page';
import BrandNameAndLogoSettings from '../components/brand-name-and-logo';
import { useT } from '@/lib/i18n-dictionary';

export default function Brand() {
  const t = useT();
  return (
    <Page
      title={t('admin.brand.title')}
      description={t('admin.brand.description')}
    >
      <div className="w-full max-w-3xl">
        <BrandNameAndLogoSettings />
      </div>
    </Page>
  );
}
