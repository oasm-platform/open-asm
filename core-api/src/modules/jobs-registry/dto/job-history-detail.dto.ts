import {
  JobPriority,
  JobStatus,
  ToolCategory,
  WorkerType,
} from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { ApiProperty } from '@nestjs/swagger';

export class JobHistoryJobItemDetail {
  @ApiProperty()
  id: string;

  @ApiProperty()
  status?: JobStatus;

  @ApiProperty()
  category: ToolCategory;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  completedAt?: Date;

  @ApiProperty()
  pickJobAt?: Date;

  @ApiProperty()
  priority?: number;

  @ApiProperty()
  command?: string;

  @ApiProperty()
  isSaveRawResult?: boolean;

  @ApiProperty()
  isSaveData?: boolean;

  @ApiProperty()
  isPublishEvent?: boolean;

  @ApiProperty()
  retryCount?: number;

  @ApiProperty({ type: () => Tool })
  tool?: Tool;

  @ApiProperty({ type: () => Asset })
  asset?: Asset;

  @ApiProperty({ type: () => Target })
  target?: Target;

  @ApiProperty({ type: () => [String] })
  errorLogs?: string[];

  @ApiProperty()
  workerId?: string;
}

export class ToolWithStatusDto {
  @ApiProperty()
  id?: string;

  @ApiProperty()
  createdAt?: Date;

  @ApiProperty()
  updatedAt?: Date;

  @ApiProperty()
  name?: string;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  command?: string;

  @ApiProperty({ enum: ToolCategory })
  category?: ToolCategory;

  @ApiProperty()
  version?: string;

  @ApiProperty()
  logoUrl?: string;

  @ApiProperty()
  isBuiltIn?: boolean;

  @ApiProperty()
  isInstalled?: boolean;

  @ApiProperty()
  isOfficialSupport?: boolean;

  @ApiProperty({ enum: WorkerType })
  type?: WorkerType;

  @ApiProperty()
  providerId?: string;

  @ApiProperty({ enum: JobPriority })
  priority?: JobPriority;

  @ApiProperty()
  availableWorkersCount?: number;

  @ApiProperty({ enum: JobStatus, required: true })
  status: JobStatus;
}

export class JobHistoryDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: () => [ToolWithStatusDto] })
  tools?: ToolWithStatusDto[];

  @ApiProperty()
  workflowName?: string;

  @ApiProperty()
  jobHistoryName?: string;
}
