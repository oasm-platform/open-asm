import { JobStatus, ToolCategory } from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Job } from '../entities/job.entity';

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

export class JobHistoryDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: () => [Tool] })
  tools?: Tool[];

  @ApiProperty({ type: () => [Job] })
  jobs: Job[];

  @ApiProperty()
  workflowName?: string;
}
