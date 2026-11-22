import Page from '@/components/common/page';
import { ListWorkspaces } from '../components/list-workspaces';
import { useT } from '@/lib/i18n-dictionary';

export default function Workspaces() {
  const t = useT();
  return (
    <Page
      title={t('admin.workspaces.title')}
      description={t('admin.workspaces.description')}
    >
      <ListWorkspaces />
    </Page>
  );
}
