import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminWorkspacesControllerGetWorkspace } from '@/services/apis/gen/queries';
import { Link, useParams } from '@tanstack/react-router';
import {
  Archive,
  Briefcase,
  CircleCheck,
  Crosshair,
  Users,
} from 'lucide-react';
import {
  DetailField,
  DetailFields,
  DetailHero,
  DetailNotFound,
  DetailSkeleton,
  formatDetailDate,
} from '../components/detail-layout';
import { ListUsers } from '../components/list-users';
import { WorkspaceEdit } from '../components/workspace-edit';

const TABS = [
  { id: 'info', label: 'Info' },
  { id: 'members', label: 'Members' },
  { id: 'edit', label: 'Edit' },
];

export default function WorkspaceDetail() {
  const { id } = useParams({ from: '/admin/workspaces/$id' });
  const { data: workspace, isLoading } =
    useAdminWorkspacesControllerGetWorkspace(id);

  if (isLoading) return <DetailSkeleton />;
  if (!workspace) return <DetailNotFound entity="Workspace" />;

  return (
    <Page isShowButtonGoBack>
      <div className="mb-4 space-y-4">
        <DetailHero
          media={
            <div className="flex size-20 items-center justify-center rounded-2xl border bg-muted">
              <Briefcase className="size-8 text-muted-foreground" />
            </div>
          }
          title={workspace.name}
          subtitle={workspace.description || 'No description'}
          badges={
            <>
              {workspace.archivedAt ? (
                <Badge variant="outline" className="gap-1">
                  <Archive />
                  Archived
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <CircleCheck />
                  Active
                </Badge>
              )}
              <Badge variant="secondary" className="gap-1">
                <Crosshair />
                {workspace.targetCount} targets
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Users />
                {workspace.memberCount} members
              </Badge>
            </>
          }
        />

        <Tabs
          tabParam="tab"
          validValues={TABS.map((tab) => tab.id)}
          className="w-full"
        >
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="hover:cursor-pointer"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="info">
            <DetailFields>
              <DetailField label="Workspace ID">
                <span className="font-mono">{workspace.id}</span>
              </DetailField>
              <DetailField label="Owner">
                {workspace.owner ? (
                  <Link
                    to="/admin/users/$id"
                    params={{ id: workspace.owner.id }}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {workspace.owner.name} ({workspace.owner.email})
                  </Link>
                ) : (
                  '—'
                )}
              </DetailField>
              <DetailField label="Asset discovery">
                {workspace.isAssetsDiscovery ? 'Enabled' : 'Disabled'}
              </DetailField>
              <DetailField label="Auto-enable discovered assets">
                {workspace.isAutoEnableAssetAfterDiscovered
                  ? 'Enabled'
                  : 'Disabled'}
              </DetailField>
              <DetailField label="Created">
                {formatDetailDate(workspace.createdAt)}
              </DetailField>
              <DetailField label="Last updated">
                {formatDetailDate(workspace.updatedAt)}
              </DetailField>
              {workspace.archivedAt && (
                <DetailField label="Archived">
                  {formatDetailDate(workspace.archivedAt)}
                </DetailField>
              )}
            </DetailFields>
          </TabsContent>

          <TabsContent value="members">
            {/* Paginated server-side: GET /admin/users?workspaceId=. */}
            <ListUsers
              workspaceId={workspace.id}
              ownerId={workspace.owner?.id}
            />
          </TabsContent>

          <TabsContent value="edit">
            {/* Keyed on updatedAt so the forms start from fresh values after a save. */}
            <WorkspaceEdit key={workspace.updatedAt} workspace={workspace} />
          </TabsContent>
        </Tabs>
      </div>
    </Page>
  );
}
