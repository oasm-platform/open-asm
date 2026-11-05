import { BaseEntity } from '@/common/entities/base.entity';
import { Artifact } from '@/modules/artifacts/entities/artifact.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
  Unique,
} from 'typeorm';
import { Project } from './project.entity';

/**
 * A workspace file attached to a project: a chat about the project reads it
 * as context. The file itself is an artifact (workspace quota, Files page);
 * detaching it only drops this row.
 */
@Entity('project_artifacts')
@Unique('UQ_project_artifacts_projectId_artifactId', ['projectId', 'artifactId'])
@Index('IDX_project_artifacts_artifactId', ['artifactId'])
export class ProjectArtifact extends BaseEntity {
  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Relation<Project>;

  @Column({ type: 'uuid' })
  artifactId: string;

  @ManyToOne(() => Artifact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'artifactId' })
  artifact: Relation<Artifact>;
}
