import Page from '@/components/common/page';
import BrandNameAndLogoSettings from './components/brand-name-and-logo';

export default function Brand() {
  return (
    <Page
      title="Brand name and logo"
      description="Shown in the sidebar, on the login screen and in the browser tab"
    >
      <div className="w-full max-w-3xl">
        <BrandNameAndLogoSettings />
      </div>
    </Page>
  );
}
