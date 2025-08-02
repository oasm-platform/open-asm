import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from 'src/common/entities/base.entity';
import { ToolCategory } from 'src/common/enums/enum';
import { ResultHandler } from 'src/common/interfaces/app.interface';
import { Column, Entity, OneToMany } from 'typeorm';
import { WorkspaceTool } from './workspace_tools.entity';

@Entity('tools')
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

  @Column({ nullable: true })
  version?: string;

  @ApiProperty()
  @Column({ nullable: true })
  logoUrl?: string;

  resultHandler: ({ dataSource, result, job }: ResultHandler) => Promise<void>;

  @ApiProperty()
  isInstalled?: boolean;
}
