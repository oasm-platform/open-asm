import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Entity, Index, ManyToOne, OneToMany, Relation } from 'typeorm';
import { Workspace } from './workspace.entity';
import { WorkspaceMemberPermission } from './workspace-member-permission.entity';
import { WorkspacePermission } from './workspace-permission.entity';
import { WorkspaceMemberUserDto } from '../dto/workspace-access.dto';

@Entity('workspace_members')
@Index('IDX_wm_workspace_user', ['workspace', 'user'])
@Index('IDX_wm_userId', ['user'])
export class WorkspaceMembers extends BaseEntity {
  @ManyToOne(() => Workspace, (workspace) => workspace.workspaceMembers, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  workspace: Relation<Workspace>;

  @ApiProperty({ type: () => WorkspaceMemberUserDto, required: false })
  @ManyToOne(() => User, (user) => user.workspaceMembers, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  user: Relation<User>;

  @OneToMany(
    () => WorkspaceMemberPermission,
    (memberPermission) => memberPermission.member,
  )
  memberPermissions: Relation<WorkspaceMemberPermission[]>;

  /**
   * Computed in toJSON: permission groups assigned to this member.
   * Not a database column — populated only when memberPermissions is loaded.
   */
  @ApiProperty({
    type: () => WorkspacePermission,
    isArray: true,
    required: false,
    description: 'Permission groups assigned to this member',
  })
  permissionGroups?: WorkspacePermission[];

  toJSON() {
    return {
      id: this.id,
      user: this.user
        ? {
            id: this.user.id,
            name: this.user.name,
            image: this.user.image,
          }
        : undefined,
      permissionGroups:
        this.permissionGroups ??
        (this.memberPermissions ?? [])
          .map((memberPermission) => memberPermission.permission)
          .filter((permission): permission is WorkspacePermission => !!permission),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
