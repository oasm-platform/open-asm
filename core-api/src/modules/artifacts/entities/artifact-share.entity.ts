import { User } from '@/modules/auth/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from 'typeorm';
import { Artifact } from './artifact.entity';

/** A workspace member an artifact with `shareType = shared` is shared with. */
@Entity('artifact_shares')
@Unique('UQ_artifact_shares_artifact_user', ['artifactId', 'userId'])
@Index('IDX_artifact_shares_user', ['userId'])
export class ArtifactShare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  artifactId: string;

  @ManyToOne(() => Artifact, (artifact) => artifact.shares, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'artifactId' })
  artifact: Relation<Artifact>;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
