import Page from '@/components/common/page';
import { ListWorkspaces } from '../components/list-workspaces';

export default function Workspaces() {
  return (
    <Page
      title="Workspaces"
      description="Browse every workspace on the platform"
    >
      <ListWorkspaces />
    </Page>
  );
}
