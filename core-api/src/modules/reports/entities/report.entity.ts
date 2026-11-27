import { BaseEntity } from '@/common/entities/base.entity';
import { Artifact } from '@/modules/artifacts/entities/artifact.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, JoinColumn, ManyToOne, Relation } from 'typeorm';

@Entity('reports')
export class Report extends BaseEntity {
  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace: Relation<Workspace>;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({
    type: 'varchar',
    default: 'SUMMARY',
  })
  /** QUERY: a saved attack surface query rendered as tables. */
  type: 'SUMMARY' | 'VULNERABILITY' | 'QUERY';

  @Column('text')
  path: string;

  @Column('text')
  fileName: string;

  /** The file and its quota charge; null on reports made before reports were artifacts. */
  @Column('uuid', { nullable: true })
  artifactId: string | null;

  @ManyToOne(() => Artifact, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'artifactId' })
  artifact?: Relation<Artifact>;
}
