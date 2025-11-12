import { JobPriority, ToolCategory, WorkerType } from '@/common/enums/enum';
import { JobDataResultType } from '@/common/types/app.types';
import { ApiKey } from '@/modules/apikeys/entities/apikey.entity';
import { AssetTag } from '@/modules/assets/entities/asset-tags.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { ToolProvider } from '@/modules/providers/entities/provider.entity';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  Column,
  Entity,
  Generated,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceTool } from './workspace_tools.entity';
import { AssetGroupTool } from '@/modules/asset-group/entities/asset-groups-tools.entity';

@Entity('tools')
@Unique(['name'])
export class Tool {
  @ApiProperty()
  @PrimaryColumn({ type: 'uuid' })
  @Generated('uuid')
  id?: string;

  @ApiProperty()
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt?: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt?: Date;

  @ApiProperty()
  @IsString()
  @Column()
  name: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  description: string;

  command?: string;

  @OneToMany(() => WorkspaceTool, (workspaceTool) => workspaceTool.tool)
  workspaceTools?: WorkspaceTool[];

  @ApiProperty({ enum: ToolCategory })
  @IsEnum(ToolCategory)
  @Column({ type: 'enum', enum: ToolCategory })
  category?: ToolCategory;

  @ApiProperty()
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  version?: string;

  @ApiProperty({ nullable: true, required: false })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  logoUrl?: string;

  // @ApiProperty()
  parser?: (result: string | undefined) => JobDataResultType;

  @ApiProperty()
  isInstalled?: boolean;

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  isOfficialSupport?: boolean;

  @ApiProperty()
  @Column({ type: 'enum', enum: WorkerType, default: WorkerType.BUILT_IN })
  @IsEnum(WorkerType)
  type?: WorkerType;

  @OneToMany(() => Job, (job) => job.tool, {
    onDelete: 'CASCADE',
  })
  jobs?: Job[];

  @OneToMany(() => Vulnerability, (vulnerability) => vulnerability.tool, {
    onDelete: 'CASCADE',
  })
  vulnerabilities?: Vulnerability[];

  @OneToMany(() => AssetTag, (assetTag) => assetTag.tool, {
    onDelete: 'CASCADE',
  })
  assetTags?: AssetTag[];

  @ApiProperty()
  @Column({ name: 'providerId', nullable: true })
  providerId?: string;

  @ManyToOne(() => ToolProvider, (provider) => provider.tools, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  provider?: ToolProvider;

  @OneToOne(() => ApiKey)
  @JoinColumn({ name: 'apiKeyId', referencedColumnName: 'id' })
  apiKey?: ApiKey;

  @OneToMany(() => WorkerInstance, (workerInstance) => workerInstance.tool)
  workers?: WorkerInstance[];

  @Column({ default: JobPriority.BACKGROUND })
  priority?: JobPriority;
}
