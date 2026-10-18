import Page from '@/components/common/page';
import { ListUsers } from './list-users';

export default function Users() {
  return (
    <Page title="Users" description="Manage user accounts across the platform">
      <ListUsers />
    </Page>
  );
}
