import { BaseEntity } from '@/common/entities/base.entity';
import { Entity, Index, ManyToOne, Relation, Unique } from 'typeorm';
import { WorkspaceMembers } from './workspace-members.entity';
import { WorkspacePermission } from './workspace-permission.entity';

@Entity('workspace_member_permissions')
@Unique('UQ_wmp_member_permission', ['member', 'permission'])
@Index('IDX_wmp_permissionId', ['permission'])
export class WorkspaceMemberPermission extends BaseEntity {
  @ManyToOne(
    () => WorkspaceMembers,
    (member) => member.memberPermissions,
    { onDelete: 'CASCADE' },
  )
  member: Relation<WorkspaceMembers>;

  @ManyToOne(
    () => WorkspacePermission,
    (permission) => permission.memberPermissions,
    { onDelete: 'CASCADE' },
  )
  permission: Relation<WorkspacePermission>;
}
