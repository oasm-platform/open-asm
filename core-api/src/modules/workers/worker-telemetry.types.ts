import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

export const WORKER_TELEMETRY_SCHEMA_VERSION = 1;
export const WORKER_TELEMETRY_TTL_SECONDS = 90;
export const WORKER_TELEMETRY_FRESH_MS = 30_000;
export const WORKER_TELEMETRY_MAX_CONTAINERS = 500;
export const WORKER_TELEMETRY_MAX_JSON_BYTES = 1024 * 1024;

export type WorkerState = 'UNSPECIFIED' | 'READY' | 'DRAINING' | 'DEGRADED';
export type ContainerRuntimeState =
  | 'UNSPECIFIED'
  | 'PROVISIONING'
  | 'RUNNING'
  | 'EXITED'
  | 'REMOVING'
  | 'UNKNOWN';
export type ContainerHealthState =
  | 'UNKNOWN'
  | 'NONE'
  | 'STARTING'
  | 'HEALTHY'
  | 'UNHEALTHY';
export type ContainerExecutionState =
  | 'NONE'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';
export type TelemetryFreshness = 'fresh' | 'stale';

export type TimestampInput =
  | Date
  | string
  | { seconds: string | number; nanos?: number }
  | null
  | undefined;

export interface WorkerHostTelemetryRequest {
  hostname?: string;
  os?: string;
  arch?: string;
  runMode?: string;
  cpuCount?: number;
  cpuUsagePercent?: number;
  memoryUsedBytes?: string | number;
  memoryTotalBytes?: string | number;
}

export interface WorkerJobTelemetryRequest {
  active?: number;
  maxConcurrency?: number;
}

export interface ManagedContainerTelemetryRequest {
  containerId?: string;
  containerName?: string;
  image?: string;
  imageVersion?: string;
  tool?: string;
  poolKey?: string;
  pooled?: boolean;
  runtimeState?: string;
  healthState?: string;
  executionState?: string;
  connectorConnected?: boolean;
  exitCode?: number;
  oomKilled?: boolean;
  createdAt?: TimestampInput;
  startedAt?: TimestampInput;
  finishedAt?: TimestampInput;
  stateChangedAt?: TimestampInput;
  lastUsedAt?: TimestampInput;
  executionId?: string;
  jobId?: string;
  traceId?: string;
  cpuLimitMillicores?: number;
  memoryLimitBytes?: string | number;
  inspectionSucceeded?: boolean;
}

export interface WorkerContainersTelemetryRequest {
  supported?: boolean;
  total?: number;
  active?: number;
  idle?: number;
  unhealthy?: number;
  truncated?: boolean;
  items?: ManagedContainerTelemetryRequest[];
}

export interface WorkerTelemetryRequest {
  schemaVersion?: number | string;
  instanceId?: string;
  sequence?: string | number;
  observedAt?: TimestampInput;
  startedAt?: TimestampInput;
  uptimeSeconds?: string | number;
  state?: string;
  version?: string;
  node?: WorkerHostTelemetryRequest;
  jobs?: WorkerJobTelemetryRequest;
  containers?: WorkerContainersTelemetryRequest;
}

export interface ManagedContainerTelemetry {
  containerId: string;
  containerName: string;
  image: string;
  imageVersion: string;
  tool: string;
  poolKey: string;
  pooled: boolean;
  runtimeState: ContainerRuntimeState;
  healthState: ContainerHealthState;
  executionState: ContainerExecutionState;
  connectorConnected: boolean;
  exitCode?: number;
  oomKilled: boolean;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  stateChangedAt?: string;
  lastUsedAt?: string;
  executionId?: string;
  jobId?: string;
  traceId?: string;
  cpuLimitMillicores: number;
  memoryLimitBytes: string;
  inspectionSucceeded: boolean;
}

export interface WorkerTelemetrySnapshot {
  schemaVersion: number;
  workerId: string;
  instanceId: string;
  sequence: string;
  state: WorkerState;
  receivedAt: string;
  observedAt: string;
  startedAt?: string;
  uptimeSeconds: number;
  version: string;
  freshness: TelemetryFreshness;
  node: {
    hostname: string;
    os: string;
    arch: string;
    runMode: string;
    cpuCount: number;
    cpuUsagePercent: number;
    memoryUsedBytes: string;
    memoryTotalBytes: string;
  };
  jobs: {
    active: number;
    maxConcurrency: number;
  };
  containers: {
    supported: boolean;
    total: number;
    active: number;
    idle: number;
    unhealthy: number;
    truncated: boolean;
    items: ManagedContainerTelemetry[];
  };
}

export interface WorkerTelemetryAck {
  acceptedSequence: string;
  receivedAt: string;
  workerId: string;
  nextReportAfterMs: number;
}

const forbiddenKeys = new Set([
  'token',
  'workertoken',
  'workerid',
  'inputs',
  'input',
  'config',
  'configuration',
  'environment',
  'env',
  'command',
  'commandline',
  'logs',
  'secret',
]);

function invalid(message: string): never {
  throw new RpcException({ code: status.INVALID_ARGUMENT, message });
}

function assertNoSecrets(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecrets(item, seen);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKeys.has(key.toLowerCase())) {
      invalid(`Telemetry field ${key} is not allowed`);
    }
    assertNoSecrets(item, seen);
  }
}

function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
  { required = false }: { required?: boolean } = {},
): string {
  if (value === undefined || value === null || value === '') {
    if (required) invalid(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') invalid(`${field} must be a string`);
  if (value.length > maxLength) {
    invalid(`${field} exceeds ${maxLength} characters`);
  }
  return value;
}

function boundedInteger(
  value: unknown,
  field: string,
  maximum: number,
  fallback = 0,
): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    invalid(`${field} must be an integer between 0 and ${maximum}`);
  }
  return parsed;
}

function uint64String(value: unknown, field: string, fallback = '0'): string {
  if (value === undefined || value === null || value === '') return fallback;
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' && Number.isSafeInteger(value)) {
    text = value.toString();
  } else if (typeof value === 'bigint') {
    text = value.toString();
  } else {
    invalid(`${field} must be an unsigned integer`);
  }
  if (!/^\d+$/.test(text)) invalid(`${field} must be an unsigned integer`);
  return text;
}

function finitePercent(value: unknown, field: string): number {
  if (value === undefined || value === null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    invalid(`${field} must be finite and between 0 and 100`);
  }
  return parsed;
}

function timestamp(value: TimestampInput, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  let parsed: Date;
  if (value instanceof Date) {
    parsed = value;
  } else if (typeof value === 'string') {
    parsed = new Date(value);
  } else {
    const seconds = Number(value.seconds ?? 0);
    const nanos = Number(value.nanos ?? 0);
    parsed = new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
  }
  if (Number.isNaN(parsed.getTime())) invalid(`${field} is invalid`);
  return parsed.toISOString();
}

function enumValue<T extends string>(
  value: unknown,
  prefix: string,
  allowed: readonly T[],
  field: string,
): T {
  const text = boundedString(value, field, 96, { required: true });
  const normalized = text.startsWith(prefix)
    ? text.slice(prefix.length)
    : text;
  if (!allowed.includes(normalized as T)) invalid(`${field} is invalid`);
  return normalized as T;
}

const workerStates = [
  'UNSPECIFIED',
  'READY',
  'DRAINING',
  'DEGRADED',
] as const;
const runtimeStates = [
  'UNSPECIFIED',
  'PROVISIONING',
  'RUNNING',
  'EXITED',
  'REMOVING',
  'UNKNOWN',
] as const;
const healthStates = [
  'UNKNOWN',
  'NONE',
  'STARTING',
  'HEALTHY',
  'UNHEALTHY',
] as const;
const executionStates = [
  'NONE',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
] as const;

export function normalizeWorkerTelemetry(
  workerId: string,
  request: WorkerTelemetryRequest,
  receivedAt: Date,
): WorkerTelemetrySnapshot {
  assertNoSecrets(request);
  const schemaVersion = boundedInteger(
    request.schemaVersion,
    'schemaVersion',
    1,
    WORKER_TELEMETRY_SCHEMA_VERSION,
  );
  if (schemaVersion !== WORKER_TELEMETRY_SCHEMA_VERSION) {
    invalid(`Unsupported telemetry schema version ${schemaVersion}`);
  }

  const sequence = uint64String(request.sequence, 'sequence');
  if (sequence === '0') invalid('sequence must be greater than zero');

  const observedAt = timestamp(request.observedAt, 'observedAt');
  if (!observedAt) invalid('observedAt is required');
  const observedMs = new Date(observedAt).getTime();
  if (observedMs > receivedAt.getTime() + 30_000) {
    invalid('observedAt is too far in the future');
  }
  if (observedMs < receivedAt.getTime() - 5 * 60_000) {
    invalid('observedAt is too old');
  }

  const containersRequest = request.containers ?? {};
  const items = Array.isArray(containersRequest.items)
    ? containersRequest.items
    : [];
  if (items.length > WORKER_TELEMETRY_MAX_CONTAINERS) {
    throw new RpcException({
      code: status.RESOURCE_EXHAUSTED,
      message: `A telemetry report may contain at most ${WORKER_TELEMETRY_MAX_CONTAINERS} containers`,
    });
  }

  const normalizedItems: ManagedContainerTelemetry[] = items.map((item) => {
    const exitCode =
      item.exitCode === undefined || item.exitCode === null
        ? undefined
        : boundedInteger(item.exitCode, 'containers[].exitCode', 255);
    return {
      containerId: boundedString(
        item.containerId,
        'containers[].containerId',
        128,
        { required: true },
      ),
      containerName: boundedString(
        item.containerName,
        'containers[].containerName',
        256,
      ),
      image: boundedString(item.image, 'containers[].image', 512),
      imageVersion: boundedString(
        item.imageVersion,
        'containers[].imageVersion',
        128,
      ),
      tool: boundedString(item.tool, 'containers[].tool', 128),
      poolKey: boundedString(item.poolKey, 'containers[].poolKey', 512),
      pooled: item.pooled === true,
      runtimeState: enumValue(
        item.runtimeState,
        'CONTAINER_RUNTIME_STATE_',
        runtimeStates,
        'containers[].runtimeState',
      ),
      healthState: enumValue(
        item.healthState,
        'CONTAINER_HEALTH_STATE_',
        healthStates,
        'containers[].healthState',
      ),
      executionState: enumValue(
        item.executionState,
        'CONTAINER_EXECUTION_STATE_',
        executionStates,
        'containers[].executionState',
      ),
      connectorConnected: item.connectorConnected === true,
      exitCode,
      oomKilled: item.oomKilled === true,
      createdAt: timestamp(item.createdAt, 'containers[].createdAt'),
      startedAt: timestamp(item.startedAt, 'containers[].startedAt'),
      finishedAt: timestamp(item.finishedAt, 'containers[].finishedAt'),
      stateChangedAt: timestamp(
        item.stateChangedAt,
        'containers[].stateChangedAt',
      ),
      lastUsedAt: timestamp(item.lastUsedAt, 'containers[].lastUsedAt'),
      executionId: boundedString(
        item.executionId,
        'containers[].executionId',
        128,
      ),
      jobId: boundedString(item.jobId, 'containers[].jobId', 128),
      traceId: boundedString(item.traceId, 'containers[].traceId', 128),
      cpuLimitMillicores: boundedInteger(
        item.cpuLimitMillicores,
        'containers[].cpuLimitMillicores',
        10_000_000,
      ),
      memoryLimitBytes: uint64String(
        item.memoryLimitBytes,
        'containers[].memoryLimitBytes',
      ),
      inspectionSucceeded: item.inspectionSucceeded === true,
    };
  });

  const node = request.node ?? {};
  const jobs = request.jobs ?? {};
  const snapshot: WorkerTelemetrySnapshot = {
    schemaVersion,
    workerId,
    instanceId: boundedString(
      request.instanceId,
      'instanceId',
      64,
      { required: true },
    ),
    sequence,
    state: enumValue(
      request.state,
      'WORKER_RUNTIME_STATE_',
      workerStates,
      'state',
    ),
    receivedAt: receivedAt.toISOString(),
    observedAt,
    startedAt: timestamp(request.startedAt, 'startedAt'),
    uptimeSeconds: boundedInteger(
      request.uptimeSeconds,
      'uptimeSeconds',
      Number.MAX_SAFE_INTEGER,
    ),
    version: boundedString(request.version, 'version', 64),
    freshness: 'fresh',
    node: {
      hostname: boundedString(node.hostname, 'node.hostname', 255),
      os: boundedString(node.os, 'node.os', 64),
      arch: boundedString(node.arch, 'node.arch', 64),
      runMode: boundedString(node.runMode, 'node.runMode', 32),
      cpuCount: boundedInteger(node.cpuCount, 'node.cpuCount', 1024),
      cpuUsagePercent: finitePercent(
        node.cpuUsagePercent,
        'node.cpuUsagePercent',
      ),
      memoryUsedBytes: uint64String(
        node.memoryUsedBytes,
        'node.memoryUsedBytes',
      ),
      memoryTotalBytes: uint64String(
        node.memoryTotalBytes,
        'node.memoryTotalBytes',
      ),
    },
    jobs: {
      active: boundedInteger(jobs.active, 'jobs.active', 1_000_000),
      maxConcurrency: boundedInteger(
        jobs.maxConcurrency,
        'jobs.maxConcurrency',
        1_000_000,
      ),
    },
    containers: {
      supported: containersRequest.supported === true,
      total: boundedInteger(
        containersRequest.total,
        'containers.total',
        1_000_000,
      ),
      active: boundedInteger(
        containersRequest.active,
        'containers.active',
        1_000_000,
      ),
      idle: boundedInteger(containersRequest.idle, 'containers.idle', 1_000_000),
      unhealthy: boundedInteger(
        containersRequest.unhealthy,
        'containers.unhealthy',
        1_000_000,
      ),
      truncated: containersRequest.truncated === true,
      items: normalizedItems,
    },
  };

  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > WORKER_TELEMETRY_MAX_JSON_BYTES) {
    throw new RpcException({
      code: status.RESOURCE_EXHAUSTED,
      message: 'Telemetry payload exceeds 1 MiB',
    });
  }
  return snapshot;
}

export function isWorkerTelemetrySnapshot(
  value: unknown,
): value is WorkerTelemetrySnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkerTelemetrySnapshot>;
  return (
    candidate.schemaVersion === WORKER_TELEMETRY_SCHEMA_VERSION &&
    typeof candidate.workerId === 'string' &&
    typeof candidate.instanceId === 'string' &&
    typeof candidate.sequence === 'string' &&
    typeof candidate.receivedAt === 'string' &&
    !Number.isNaN(new Date(candidate.receivedAt).getTime()) &&
    Array.isArray(candidate.containers?.items)
  );
}
