import Page from '@/components/common/page';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminUsersControllerGetUser } from '@/services/apis/gen/queries';
import { useParams } from '@tanstack/react-router';
import {
  Ban,
  CircleCheck,
  Clock,
  MailCheck,
  MailWarning,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import {
  DetailHero,
  DetailNotFound,
  DetailSkeleton,
} from '../components/detail-layout';
import { UserEdit } from '../components/user-edit';
import { UserInfo } from '../components/user-info';
import { useT } from '@/lib/i18n-dictionary';

const TABS = [
  { id: 'info', labelKey: 'admin.detail.tabs.info' },
  { id: 'edit', labelKey: 'common.edit' },
];

export default function UserDetail() {
  const t = useT();
  const { id } = useParams({ from: '/admin/users/$id' });
  const { data: user, isLoading } = useAdminUsersControllerGetUser(id);

  if (isLoading) return <DetailSkeleton />;
  if (!user) return <DetailNotFound entity={t('admin.detail.entity.user')} />;

  return (
    <Page documentTitle={user.name ? t('admin.detail.documentTitle', { name: user.name }) : undefined}>
      <div className="mb-4 space-y-4">
        <DetailHero
          media={
            <Avatar className="size-20 border">
              <AvatarImage src={user.image ?? undefined} alt={user.name} />
              <AvatarFallback className="text-2xl">
                {user.name?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          }
          title={user.name}
          subtitle={user.email}
          badges={
            <>
              <Badge variant="secondary" className="gap-1 capitalize">
                {user.role === 'admin' ? <ShieldCheck /> : <UserIcon />}
                {user.role}
              </Badge>
              {user.pendingApproval ? (
                <Badge variant="outline" className="gap-1">
                  <Clock />
                  {t('admin.detail.status.pendingApproval')}
                </Badge>
              ) : user.banned ? (
                <Badge variant="destructive" className="gap-1">
                  <Ban />
                  {t('admin.detail.status.banned')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <CircleCheck />
                  {t('admin.detail.status.active')}
                </Badge>
              )}
              <Badge variant="secondary" className="gap-1">
                {user.emailVerified ? <MailCheck /> : <MailWarning />}
                {user.emailVerified
                  ? t('admin.detail.emailVerified')
                  : t('admin.detail.emailUnverified')}
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
            <UserInfo user={user} />
          </TabsContent>
          <TabsContent value="edit">
            {/* Keyed on updatedAt so the forms start from fresh values after a save. */}
            <UserEdit key={user.updatedAt} user={user} />
          </TabsContent>
        </Tabs>
      </div>
    </Page>
  );
}
