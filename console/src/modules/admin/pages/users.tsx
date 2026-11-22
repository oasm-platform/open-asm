import Page from '@/components/common/page';
import { ListUsers } from '../components/list-users';
import { useT } from '@/lib/i18n-dictionary';

export default function Users() {
  const t = useT();
  return (
    <Page title={t('admin.users.title')} description={t('admin.users.description')}>
      <ListUsers />
    </Page>
  );
}
