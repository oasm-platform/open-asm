import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { WorkspaceTool } from './workspace_tools.entity';

@Entity('tools')
export class Tool extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @OneToMany(() => WorkspaceTool, workspaceTool => workspaceTool.tool)
  workspaceTools: WorkspaceTool[];
}
