import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from 'src/common/entities/base.entity';
import { JobStatus, ToolCategory } from 'src/common/enums/enum';
import { Asset } from 'src/modules/assets/entities/assets.entity';
import { Tool } from 'src/modules/tools/entities/tools.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { JobHistory } from './job-history.entity';

@Entity('jobs')
export class Job extends BaseEntity {
  @ManyToOne(() => Asset, (asset) => asset.jobs, {
    onDelete: 'CASCADE',
  })
  asset: Asset;

  @ApiProperty()
  @Column({ type: 'enum', enum: ToolCategory })
  category: ToolCategory;

  @ApiProperty()
  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.PENDING })
  status?: JobStatus;

  @ApiProperty()
  @Column({ nullable: true })
  pickJobAt?: Date;

  @Column({ nullable: true })
  workerId?: string;

  @ManyToOne(() => Tool, (tool) => tool.jobs, {
    onDelete: 'CASCADE',
  })
  tool: Tool;

  @Column({ type: 'json', nullable: true })
  rawResult?: object;

  @ApiProperty()
  @Column({ nullable: true })
  completedAt?: Date;

  @ManyToOne(() => JobHistory, (jobHistory) => jobHistory.jobs, {
    onDelete: 'CASCADE',
  })
  jobHistory: JobHistory;
}
