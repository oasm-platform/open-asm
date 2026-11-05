import { BaseEntity } from '@/common/entities/base.entity';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Relation,
} from 'typeorm';
import { ProjectLastRunDto } from '../dto/project-last-run.dto';
import { Project } from './project.entity';
import { ProjectWorkflowTrigger } from './project-workflow-trigger.entity';

/**
 * A workflow of a project (the "binding"). The workflow itself is owned by
 * the project: it is created for it, edited from it and deleted with it. When
 * and how it runs lives on its triggers.
 */
@Entity('project_workflows')
@Index('IDX_pw_projectId', ['project'])
@Index('IDX_pw_workflowId', ['workflow'])
@Index('IDX_pw_projectId_workflowId', ['projectId', 'workflowId'], {
  unique: true,
})
export class ProjectWorkflow extends BaseEntity {
  @ManyToOne(() => Project, (project) => project.projectWorkflows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project: Relation<Project>;

  // Explicit FK column so the join id is available without loading the
  // relation (query builders only select it when the relation is joined).
  @ApiProperty()
  @Column({ name: 'projectId', type: 'uuid' })
  projectId: string;

  @ApiProperty({ type: () => Workflow })
  @ManyToOne(() => Workflow, (workflow) => workflow.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflowId' })
  workflow: Relation<Workflow>;

  @ApiProperty()
  @Column({ name: 'workflowId', type: 'uuid' })
  workflowId: string;

  @ApiProperty({ type: () => [ProjectWorkflowTrigger], required: false })
  @OneToMany(() => ProjectWorkflowTrigger, (trigger) => trigger.projectWorkflow)
  triggers?: Relation<ProjectWorkflowTrigger[]>;

  @ApiProperty({ type: () => ProjectLastRunDto, required: false, nullable: true })
  lastRun?: ProjectLastRunDto | null;
}
