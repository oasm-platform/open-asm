import Page from '@/components/common/page';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminUsersControllerGetUser } from '@/services/apis/gen/queries';
import { useParams } from '@tanstack/react-router';
import {
  Ban,
  CircleCheck,
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

const TABS = [
  { id: 'info', label: 'Info' },
  { id: 'edit', label: 'Edit' },
];

export default function UserDetail() {
  const { id } = useParams({ from: '/admin/users/$id' });
  const { data: user, isLoading } = useAdminUsersControllerGetUser(id);

  if (isLoading) return <DetailSkeleton />;
  if (!user) return <DetailNotFound entity="User" />;

  return (
    <Page isShowButtonGoBack>
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
              {user.banned ? (
                <Badge variant="destructive" className="gap-1">
                  <Ban />
                  Banned
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <CircleCheck />
                  Active
                </Badge>
              )}
              <Badge variant="secondary" className="gap-1">
                {user.emailVerified ? <MailCheck /> : <MailWarning />}
                {user.emailVerified ? 'Email verified' : 'Email unverified'}
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
