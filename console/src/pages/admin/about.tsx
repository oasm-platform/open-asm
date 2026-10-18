import Page from '@/components/common/page';
import GetAboutProject from './components/get-about-project';

export default function About() {
  return (
    <Page
      title="About"
      description="Version, updates and license information"
    >
      <div className="w-full max-w-3xl">
        <GetAboutProject />
      </div>
    </Page>
  );
}
