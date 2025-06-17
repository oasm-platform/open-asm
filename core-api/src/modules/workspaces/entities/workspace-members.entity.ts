import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Workspace } from './workspace.entity';
import { User } from 'src/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('workspace_members')
export class WorkspaceMembers extends BaseEntity {
  @ApiProperty({
    description: 'The workspace the user is a member of',
  })
  @ManyToOne(() => Workspace, (workspace) => workspace.workspaceMembers)
  workspace: Workspace;

  @ApiProperty({
    description: 'The user that is a member of the workspace',
  })
  @ManyToOne(() => User, (user) => user.workspaceMembers)
  user: User;
}
