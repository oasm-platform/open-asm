import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { WorkerScope, WorkerType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { WorkerTelemetryDto } from './worker-telemetry.dto';

export class WorkerManifestResponseDto {
  @ApiProperty({
    description: 'Commands to initialize worker tools',
    example: ['nuclei -ut'],
    type: [String],
  })
  initCommands: string[];
}

export class WorkerMetadataDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  os?: string;

  @ApiProperty({
    required: false,
    enum: [0, 1, 2],
    description:
      'Worker run mode enum over gRPC: 0=UNKNOWN, 1=CLI, 2=NODE. Accepts numeric or string.',
  })
  @IsOptional()
  mode?: number | string;
}

export class WorkerJoinDto {
  @ApiProperty()
  @IsString()
  apiKey: string;

  @ApiProperty({ required: false })
  @IsString()
  signature: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  token?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  ipAddress?: string;

  @ApiProperty({ required: false, type: () => WorkerMetadataDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkerMetadataDto)
  metadata?: WorkerMetadataDto;
}

export class WorkerAliveDto {
  @ApiProperty()
  @IsString()
  token: string;
}

export class GetManyWorkersDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsUUID('4')
  @IsOptional()
  workspaceId?: string;

  @ApiProperty({ required: false, enum: ['cloud', 'workspace'] })
  @IsString()
  @IsOptional()
  scope?: string;

  @ApiProperty({ required: false, enum: ['cli', 'node'] })
  @IsString()
  @IsOptional()
  runMode?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  enabledAgentMode?: boolean;
}

/**
 * A job a worker is running right now, as far as the worker diagram needs it:
 * enough to label the node that is scanning. Deliberately tiny — the detail
 * endpoint is polled every few seconds, and `/jobs-registry` is where full job
 * records live.
 */
export class WorkerToolJobDto {
  @ApiProperty({
    required: false,
    description:
      'Asset value the job targets (host, domain, IP). Absent when the job runs against an asset service or a whole asset group.',
  })
  target?: string;

  @ApiProperty({
    required: false,
    description:
      'Service value the job targets, when the job was queued for a specific service.',
  })
  service?: string;
}

/**
 * A single tool available on a worker. Built-in tools use the `Tool.id` (uuid)
 * as their identifier; Docker connectors use their manifest slug.
 */
export class WorkerToolDto {
  @ApiProperty({
    description: 'Tool id. Built-in tools use the Tool uuid; connectors use the manifest slug.',
  })
  id: string;

  @ApiProperty({
    description:
      'Display name. Built-in tools use their product name; connectors use their manifest slug — the identifier clients write in tool config.',
  })
  name: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  logoUrl?: string | null;

  @ApiProperty({ required: false })
  category?: string;

  @ApiProperty({ enum: ['builtin', 'connector'] })
  type: 'builtin' | 'connector';

  @ApiProperty({
    type: () => [WorkerToolJobDto],
    description:
      'Jobs this worker is currently running with this tool. Capped server-side; may be shorter than the worker-level `currentJobsCount`.',
  })
  currentJobs: WorkerToolJobDto[];
}

/**
 * Response DTO for a single worker (`GET /workers/:id`).
 */
export class GetWorkerResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  lastSeenAt: Date;

  @ApiProperty({ required: false })
  name?: string;

  @ApiProperty({ required: false })
  os?: string;

  @ApiProperty({ required: false })
  ipAddress?: string;

  @ApiProperty({ enum: WorkerType })
  type: WorkerType;

  @ApiProperty({ enum: WorkerScope })
  scope: WorkerScope;

  @ApiProperty({ required: false, enum: ['cli', 'node'], nullable: true })
  runMode?: 'cli' | 'node' | null;

  @ApiProperty({ required: false })
  enabledAgentMode?: boolean;

  @ApiProperty({ required: false })
  internalNetworkId?: string;

  @ApiProperty()
  currentJobsCount: number;

  @ApiProperty()
  toolsCount: number;

  @ApiProperty()
  isOnline: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    type: WorkerTelemetryDto,
    description: 'Latest ephemeral worker and container telemetry snapshot from Redis.',
  })
  telemetry?: WorkerTelemetryDto | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'The bound tool provider, when the worker is attached to one.',
  })
  tool?: { id: string; name: string } | null;

  @ApiProperty({ type: () => [WorkerToolDto] })
  tools: WorkerToolDto[];
}
