import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Relation,
  Unique,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { WorkspaceMemberPermission } from './workspace-member-permission.entity';

@Entity('workspace_permissions')
@Unique('UQ_wp_workspace_name', ['workspace', 'name'])
@Index('IDX_wp_workspaceId', ['workspace'])
export class WorkspacePermission extends BaseEntity {
  @ManyToOne(() => Workspace, (workspace) => workspace.permissions, {
    onDelete: 'CASCADE',
  })
  workspace: Relation<Workspace>;

  @ApiProperty({ example: 'Viewer', description: 'Permission group name' })
  @Column('text')
  name: string;

  @ApiProperty({
    example: ['group.read', 'target.read'],
    description:
      'Permission keys granted by this group. Wildcard "*" grants everything (system Admin group only).',
  })
  @Column('text', { array: true, default: () => "'{}'" })
  permissions: string[];

  @ApiProperty({
    default: false,
    description: 'System groups (e.g. Admin) cannot be edited or deleted',
  })
  @Column({ default: false })
  isSystem: boolean;

  @OneToMany(
    () => WorkspaceMemberPermission,
    (memberPermission) => memberPermission.permission,
  )
  memberPermissions: Relation<WorkspaceMemberPermission[]>;

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      permissions: this.permissions,
      isSystem: this.isSystem,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
