import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Relation,
  Unique,
} from 'typeorm';
import { ProjectAsset } from './project-asset.entity';
import { ProjectScopeRule } from './project-scope-rule.entity';
import { ProjectWorkflow } from './project-workflow.entity';

@Unique(['name', 'workspace'])
@Entity('projects')
export class Project extends BaseEntity {
  @ApiProperty()
  @Column()
  name: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @ApiProperty({ example: '#78716C', required: false })
  @Column({ nullable: true, default: '#78716C' }) // stone-500 tailwind css
  hexColor: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** What an agent chatting about the project must follow; in its prompt. */
  @ApiProperty({ type: String, required: false, nullable: true, maxLength: 2000 })
  @Column({ type: 'varchar', length: 2000, nullable: true })
  instruction: string | null;

  /**
   * Whether assets created after the scope rules were saved (discovery,
   * integration syncs) join the project when they match a rule. Off, the rules
   * only apply when they are edited.
   */
  @ApiProperty()
  @Column({ default: true })
  autoAddAssets: boolean;

  /**
   * Set while the project is archived: schedules are unregistered, event
   * triggers are ignored and the project is read-only.
   */
  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    nullable: true,
  })
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @OneToMany(() => ProjectAsset, (projectAsset) => projectAsset.project)
  projectAssets: Relation<ProjectAsset[]>;

  @ApiProperty({ type: () => [ProjectWorkflow], required: false })
  @OneToMany(
    () => ProjectWorkflow,
    (projectWorkflow) => projectWorkflow.project,
  )
  projectWorkflows: Relation<ProjectWorkflow[]>;

  @OneToMany(() => ProjectScopeRule, (rule) => rule.project)
  scopeRules: Relation<ProjectScopeRule[]>;

  @ApiProperty()
  totalAssets: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
  })
  lastRunAt?: Date | null;
}
