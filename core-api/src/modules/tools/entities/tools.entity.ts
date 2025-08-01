import { BaseEntity } from 'src/common/entities/base.entity';
import { ToolCategory } from 'src/common/enums/enum';
import { ResultHandler } from 'src/common/interfaces/app.interface';
import { Column, Entity, OneToMany } from 'typeorm';
import { WorkspaceTool } from './workspace_tools.entity';

@Entity('tools')
export class Tool extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  command?: string;

  @OneToMany(() => WorkspaceTool, (workspaceTool) => workspaceTool.tool)
  workspaceTools: WorkspaceTool[];

  @Column({ type: 'enum', enum: ToolCategory })
  category: ToolCategory;

  @Column({ nullable: true })
  version?: string;

  resultHandler: ({ dataSource, result, job }: ResultHandler) => Promise<void>;
}
