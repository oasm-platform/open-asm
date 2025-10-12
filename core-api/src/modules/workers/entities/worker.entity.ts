import { BaseEntity } from '@/common/entities/base.entity';
import { WorkerScope, WorkerType } from '@/common/enums/enum';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, ManyToOne } from 'typeorm';

@Entity('workers')
export class WorkerInstance extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastSeenAt: Date;

  @ApiProperty()
  @Column({ nullable: true })
  token: string;

  @ApiProperty()
  currentJobsCount?: number;

  @ApiProperty()
  @Column({ type: 'enum', enum: WorkerType, default: WorkerType.BUILT_IN })
  type: WorkerType;

  @ApiProperty()
  @Column({ type: 'enum', enum: WorkerScope, default: WorkerScope.WORKSPACE })
  scope: WorkerScope;

  @ManyToOne(() => Workspace, (workspace) => workspace.workers)
  workspace: Workspace;

  @ManyToOne(() => Tool, (tool) => tool.workers)
  tool: Tool;
}
