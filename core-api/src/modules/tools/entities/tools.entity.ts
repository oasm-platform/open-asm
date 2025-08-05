import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from 'src/common/entities/base.entity';
import { ToolCategory, WorkerType } from 'src/common/enums/enum';
import { ResultHandler } from 'src/common/interfaces/app.interface';
import { Column, Entity, OneToMany, Unique } from 'typeorm';
import { WorkspaceTool } from './workspace_tools.entity';

@Entity('tools')
@Unique(['name', 'category'])
export class Tool extends BaseEntity {
  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty()
  @Column({ nullable: true })
  description: string;

  command?: string;

  @OneToMany(() => WorkspaceTool, (workspaceTool) => workspaceTool.tool)
  workspaceTools: WorkspaceTool[];

  @ApiProperty({ enum: ToolCategory })
  @Column({ type: 'enum', enum: ToolCategory })
  category: ToolCategory;

  @ApiProperty()
  @Column({ nullable: true })
  version?: string;

  @ApiProperty()
  @Column({ nullable: true })
  logoUrl?: string;

  resultHandler: ({ dataSource, result, job }: ResultHandler) => Promise<void>;

  @ApiProperty()
  isInstalled?: boolean;

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  isOfficialSupport: boolean;

  @ApiProperty()
  @Column({ type: 'enum', enum: WorkerType, default: WorkerType.BUILT_IN })
  type: WorkerType;
}
