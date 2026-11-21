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
import { useT } from '@/lib/i18n-dictionary';

const TABS = [
  { id: 'info', labelKey: 'admin.detail.tabs.info' },
  { id: 'members', labelKey: 'admin.detail.tabs.members' },
  { id: 'edit', labelKey: 'common.edit' },
];

export default function WorkspaceDetail() {
  const t = useT();
  const { id } = useParams({ from: '/admin/workspaces/$id' });
  const { data: workspace, isLoading } =
    useAdminWorkspacesControllerGetWorkspace(id);

  if (isLoading) return <DetailSkeleton />;
  if (!workspace) return <DetailNotFound entity={t('admin.detail.entity.workspace')} />;

  return (
    <Page documentTitle={workspace.name
          ? t('admin.detail.documentTitle', { name: workspace.name })
          : undefined}>
      <div className="mb-4 space-y-4">
        <DetailHero
          media={
            <div className="flex size-20 items-center justify-center rounded-2xl border bg-muted">
              <Briefcase className="size-8 text-muted-foreground" />
            </div>
          }
          title={workspace.name}
          subtitle={workspace.description || t('admin.detail.noDescription')}
          badges={
            <>
              {workspace.archivedAt ? (
                <Badge variant="outline" className="gap-1">
                  <Archive />
                  {t('admin.detail.status.archived')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <CircleCheck />
                  {t('admin.detail.status.active')}
                </Badge>
              )}
              <Badge variant="secondary" className="gap-1">
                <Crosshair />
                {t('admin.detail.targetCount', { count: workspace.targetCount })}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Users />
                {t('admin.detail.memberCount', { count: workspace.memberCount })}
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
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="info">
            <DetailFields>
              <DetailField label={t('admin.detail.workspaceId')}>
                <span className="font-mono">{workspace.id}</span>
              </DetailField>
              <DetailField label={t('admin.detail.owner')}>
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
              <DetailField label={t('admin.detail.assetDiscovery')}>
                {workspace.isAssetsDiscovery
                  ? t('common.enabled')
                  : t('common.disabled')}
              </DetailField>
              <DetailField label={t('admin.detail.autoEnableAssets')}>
                {workspace.isAutoEnableAssetAfterDiscovered
                  ? t('common.enabled')
                  : t('common.disabled')}
              </DetailField>
              <DetailField label={t('admin.detail.created')}>
                {formatDetailDate(workspace.createdAt)}
              </DetailField>
              <DetailField label={t('admin.detail.lastUpdated')}>
                {formatDetailDate(workspace.updatedAt)}
              </DetailField>
              {workspace.archivedAt && (
                <DetailField label={t('admin.detail.status.archived')}>
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
