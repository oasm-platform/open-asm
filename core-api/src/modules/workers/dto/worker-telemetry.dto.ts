import { ApiProperty } from '@nestjs/swagger';

export class WorkerTelemetryNodeDto {
  @ApiProperty()
  hostname: string;

  @ApiProperty()
  os: string;

  @ApiProperty()
  arch: string;

  @ApiProperty()
  runMode: string;

  @ApiProperty()
  cpuCount: number;

  @ApiProperty()
  cpuUsagePercent: number;

  @ApiProperty({ description: 'Bytes represented as a decimal string.' })
  memoryUsedBytes: string;

  @ApiProperty({ description: 'Bytes represented as a decimal string.' })
  memoryTotalBytes: string;
}

export class WorkerTelemetryJobsDto {
  @ApiProperty()
  active: number;

  @ApiProperty()
  maxConcurrency: number;
}

export class ManagedContainerTelemetryDto {
  @ApiProperty()
  containerId: string;

  @ApiProperty()
  containerName: string;

  @ApiProperty()
  image: string;

  @ApiProperty()
  imageVersion: string;

  @ApiProperty()
  tool: string;

  @ApiProperty()
  poolKey: string;

  @ApiProperty()
  pooled: boolean;

  @ApiProperty({
    enum: ['UNSPECIFIED', 'PROVISIONING', 'RUNNING', 'EXITED', 'REMOVING', 'UNKNOWN'],
  })
  runtimeState: string;

  @ApiProperty({
    enum: ['UNKNOWN', 'NONE', 'STARTING', 'HEALTHY', 'UNHEALTHY'],
  })
  healthState: string;

  @ApiProperty({
    enum: ['NONE', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'FAILED'],
  })
  executionState: string;

  @ApiProperty()
  connectorConnected: boolean;

  @ApiProperty({ required: false })
  exitCode?: number;

  @ApiProperty()
  oomKilled: boolean;

  @ApiProperty({ required: false })
  createdAt?: string;

  @ApiProperty({ required: false })
  startedAt?: string;

  @ApiProperty({ required: false })
  finishedAt?: string;

  @ApiProperty({ required: false })
  stateChangedAt?: string;

  @ApiProperty({ required: false })
  lastUsedAt?: string;

  @ApiProperty({ required: false })
  executionId?: string;

  @ApiProperty({ required: false })
  jobId?: string;

  @ApiProperty({ required: false })
  traceId?: string;

  @ApiProperty()
  cpuLimitMillicores: number;

  @ApiProperty({ description: 'Bytes represented as a decimal string.' })
  memoryLimitBytes: string;

  @ApiProperty()
  inspectionSucceeded: boolean;
}

export class WorkerContainersTelemetryDto {
  @ApiProperty()
  supported: boolean;

  @ApiProperty()
  total: number;

  @ApiProperty()
  active: number;

  @ApiProperty()
  idle: number;

  @ApiProperty()
  unhealthy: number;

  @ApiProperty()
  truncated: boolean;

  @ApiProperty({ type: () => [ManagedContainerTelemetryDto] })
  items: ManagedContainerTelemetryDto[];
}

export class WorkerTelemetryDto {
  @ApiProperty()
  schemaVersion: number;

  @ApiProperty()
  workerId: string;

  @ApiProperty()
  instanceId: string;

  @ApiProperty()
  sequence: string;

  @ApiProperty({ enum: ['UNSPECIFIED', 'READY', 'DRAINING', 'DEGRADED'] })
  state: string;

  @ApiProperty()
  receivedAt: string;

  @ApiProperty()
  observedAt: string;

  @ApiProperty({ required: false })
  startedAt?: string;

  @ApiProperty()
  uptimeSeconds: number;

  @ApiProperty()
  version: string;

  @ApiProperty({ enum: ['fresh', 'stale'] })
  freshness: 'fresh' | 'stale';

  @ApiProperty({ type: WorkerTelemetryNodeDto })
  node: WorkerTelemetryNodeDto;

  @ApiProperty({ type: WorkerTelemetryJobsDto })
  jobs: WorkerTelemetryJobsDto;

  @ApiProperty({ type: WorkerContainersTelemetryDto })
  containers: WorkerContainersTelemetryDto;
}
