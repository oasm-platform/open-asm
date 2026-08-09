import { BaseEntity } from '@/common/entities/base.entity';
import { InvitationStatus } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, ManyToOne, Relation } from 'typeorm';
import { Workspace } from './workspace.entity';

@Entity('workspace_invitations')
@Index('IDX_wi_workspaceId', ['workspace'])
@Index('IDX_wi_email', ['email'])
export class WorkspaceInvitation extends BaseEntity {
  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace: Relation<Workspace>;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  invitedBy: Relation<User>;

  @ApiProperty({ example: 'user@example.com' })
  @Column('text')
  email: string;

  @ApiProperty({
    example: ['uuid'],
    description:
      'Permission group ids to grant when the invitation is accepted',
  })
  @Column('uuid', { array: true, default: () => "'{}'" })
  permissionIds: string[];

  /** SHA-256 hex digest of the raw invite token. The raw token is never stored. */
  @Column('text', { unique: true })
  tokenHash: string;

  @ApiProperty({ example: InvitationStatus.PENDING })
  @Column({ type: 'varchar', default: InvitationStatus.PENDING })
  status: InvitationStatus;

  @ApiProperty({ example: '2026-08-13T00:00:00.000Z' })
  @Column('timestamptz')
  expiresAt: Date;

  toJSON() {
    return {
      id: this.id,
      email: this.email,
      permissionIds: this.permissionIds,
      status: this.status,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      workspace: this.workspace
        ? { id: this.workspace.id, name: this.workspace.name }
        : undefined,
      invitedBy: this.invitedBy
        ? {
            id: this.invitedBy.id,
            name: this.invitedBy.name,
            image: this.invitedBy.image,
          }
        : undefined,
    };
  }
}
