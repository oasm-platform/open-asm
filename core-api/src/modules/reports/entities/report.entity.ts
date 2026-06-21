import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('reports')
export class Report extends BaseEntity {
  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace: Workspace;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: ['SUMMARY', 'VULNERABILITY'],
    default: 'SUMMARY',
  })
  type: 'SUMMARY' | 'VULNERABILITY';

  @Column('text')
  path: string;

  @Column('text')
  fileName: string;
}
