import type { AdminUserDto } from '@/services/apis/gen/queries';
import {
  DetailField,
  DetailFields,
  formatDetailDate,
} from './detail-layout';
import { UserPresence } from './user-presence';

/** Read-only view of a user account. Changes happen in the Edit tab. */
export function UserInfo({ user }: { user: AdminUserDto }) {
  return (
    <DetailFields>
      <DetailField label="User ID">
        <span className="font-mono">{user.id}</span>
      </DetailField>
      <DetailField label="Name">{user.name || '—'}</DetailField>
      <DetailField label="Email">{user.email}</DetailField>
      <DetailField label="Email verified">
        {user.emailVerified ? 'Yes' : 'No'}
      </DetailField>
      <DetailField label="Joined">{formatDetailDate(user.createdAt)}</DetailField>
      <DetailField label="Last updated">
        {formatDetailDate(user.updatedAt)}
      </DetailField>
      <DetailField label="Last active">
        <UserPresence lastActiveAt={user.lastActiveAt} />
      </DetailField>
      {user.banned && (
        <>
          <DetailField label="Ban reason">{user.banReason || '—'}</DetailField>
          <DetailField label="Ban expires">
            {user.banExpires ? formatDetailDate(user.banExpires) : 'Never'}
          </DetailField>
        </>
      )}
    </DetailFields>
  );
}
