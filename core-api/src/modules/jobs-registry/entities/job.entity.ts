import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from 'src/common/entities/base.entity';
import { JobPriority, JobStatus, ToolCategory } from 'src/common/enums/enum';
import { Asset } from 'src/modules/assets/entities/assets.entity';
import { Tool } from 'src/modules/tools/entities/tools.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { JobHistory } from './job-history.entity';

@Entity('jobs')
export class Job extends BaseEntity {
  /**
   * The asset this job belongs to.
   */
  @ManyToOne(() => Asset, (asset) => asset.jobs, {
    onDelete: 'CASCADE',
  })
  asset: Asset;

  /**
   * The category of the tool used in the job.
   */
  @ApiProperty()
  @Column({ type: 'enum', enum: ToolCategory })
  category: ToolCategory;

  /**
   * The current status of the job.
   */
  @ApiProperty()
  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.PENDING })
  status?: JobStatus;

  /**
   * The timestamp when the job was picked up by a worker.
   */
  @ApiProperty()
  @Column({ nullable: true })
  pickJobAt?: Date;

  /**
   * The priority of the job.
   */
  @Column({ type: 'enum', enum: JobPriority, default: JobPriority.BACKGROUND })
  priority?: JobPriority;

  /**
   * The ID of the worker that is processing the job.
   */
  @Column({ nullable: true })
  workerId?: string;

  /**
   * The tool used for this job.
   */
  @ManyToOne(() => Tool, (tool) => tool.jobs, {
    onDelete: 'CASCADE',
  })
  tool: Tool;

  /**
   * The raw result from the tool execution.
   */
  @Column({ type: 'json', nullable: true })
  rawResult?: object;

  /**
   * The timestamp when the job was completed.
   */
  @ApiProperty()
  @Column({ nullable: true })
  completedAt?: Date;

  /**
   * The history of this job.
   */
  @ManyToOne(() => JobHistory, (jobHistory) => jobHistory.jobs, {
    onDelete: 'CASCADE',
  })
  jobHistory: JobHistory;

  /**
   * Flag to indicate if the raw result should be saved.
   */
  @Column({ default: false })
  isSaveRawResult?: boolean;

  /**
   * Flag to indicate if the processed data should be saved.
   */
  @Column({ default: true })
  isSaveData?: boolean;

  /**
 * Flag to publish event redis for all system.
 */
  @Column({ default: false })
  isPublishEvent?: boolean;

  /**
   * The path to the result file.
   */
  @Column({ nullable: true })
  pathResult?: string;

  /**
   * The command executed for this job.
   */
  @Column({ nullable: true })
  command?: string;


}