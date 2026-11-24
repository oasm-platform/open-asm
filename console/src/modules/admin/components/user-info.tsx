import type { AdminUserDto } from '@/services/apis/gen/queries';
import {
  DetailField,
  DetailFields,
  formatDetailDate,
} from './detail-layout';
import { UserPresence } from './user-presence';
import { useT } from '@/lib/i18n-dictionary';

/** Read-only view of a user account. Changes happen in the Edit tab. */
export function UserInfo({ user }: { user: AdminUserDto }) {
  const t = useT();
  return (
    <DetailFields>
      <DetailField label={t('admin.userInfo.userId')}>
        <span className="font-mono">{user.id}</span>
      </DetailField>
      <DetailField label={t('admin.userInfo.name')}>{user.name || '—'}</DetailField>
      <DetailField label={t('admin.userInfo.email')}>{user.email}</DetailField>
      <DetailField label={t('admin.userInfo.emailVerified')}>
        {user.emailVerified ? t('common.yes') : t('common.no')}
      </DetailField>
      <DetailField label={t('admin.userInfo.joined')}>{formatDetailDate(user.createdAt)}</DetailField>
      <DetailField label={t('admin.detail.lastUpdated')}>
        {formatDetailDate(user.updatedAt)}
      </DetailField>
      <DetailField label={t('admin.userInfo.lastActive')}>
        <UserPresence lastActiveAt={user.lastActiveAt} />
      </DetailField>
      {user.banned && !user.pendingApproval && (
        <>
          <DetailField label={t('admin.userInfo.banReason')}>{user.banReason || '—'}</DetailField>
          <DetailField label={t('admin.userInfo.banExpires')}>
            {user.banExpires ? formatDetailDate(user.banExpires) : t('admin.userInfo.never')}
          </DetailField>
        </>
      )}
    </DetailFields>
  );
}
