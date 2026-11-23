import { Severity, ToolCategory } from '@/common/enums/enum';
import { GrpcWorkerContext } from '@/common/guards/grpc-worker-context.service';
import { GrpcWorkerTokenGuard } from '@/common/guards/grpc-worker-token.guard';
import { Body, Controller, Logger, UseGuards } from '@nestjs/common';
import type { Metadata } from '@grpc/grpc-js';
import { GrpcMethod } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { Asset } from '../assets/entities/assets.entity';
import { DiscoveredUrl } from '../assets/entities/discovered-url.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { IntegrationConfigReader } from '../integrations/integration-config.reader';
import { ToolConfigProfilesService } from '../tools/tool-config-profiles.service';
import { WorkerInstance } from '../workers/entities/worker.entity';
import { secretReleaseDenial } from './job-secret-release.policy';
import { sealJobSecrets } from './job-secret-sealer';
import {
  buildConnectorInputs,
  isRepositoryAsset,
  repositoryUsername,
} from './connector-inputs';
import { GetNextJobResult, HttpProbeResultDto, PortsResultDto, ScreenshotResultDto, SubdomainResultDto, UpdateResultDto, UrlDiscoveryResultDto, VulnerabilitiesResultDto } from './dto/jobs-registry.dto';
import { JobDispatchService } from './job-dispatch.service';
import { JobsRegistryService } from './jobs-registry.service';
import { authenticatedWorkerId } from './worker-identity';

/**
 * Packs a single JSON-ish value into a `google.protobuf.Value` wire object.
 * protobufjs only reads the `fields` key of a Struct (and the oneof key of a
 * Value), so plain records/values are silently dropped during gRPC encoding.
 */
function packStructValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: 0 };
  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'number':
      return { numberValue: value };
    case 'boolean':
      return { boolValue: value };
    case 'object':
      if (Array.isArray(value)) {
        return { listValue: { values: value.map(packStructValue) } };
      }
      return {
        structValue: { fields: packStructFields(value as Record<string, unknown>) },
      };
    default:
      // undefined / function / symbol — not JSON-representable; omit at field level
      return { nullValue: 0 };
  }
}

/** Packs a plain record into a `google.protobuf.Struct` `fields` map. */
function packStructFields(record: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const fields: Record<string, Record<string, unknown>> = {};
  for (const [key, val] of Object.entries(record)) {
    if (val !== undefined) fields[key] = packStructValue(val);
  }
  return fields;
}

const VALID_SEVERITIES = new Set<string>(Object.values(Severity));

/** Decrypted job configs of one claim, keyed by what decides them. */
type ResolvedConfigs = Map<string, Promise<Record<string, unknown> | undefined>>;

/**
 * The gRPC loader is configured with `enums: String`, so the worker delivers
 * severity as the proto enum NAME (e.g. "HIGH"). Normalize it to the domain's
 * lowercase `Severity` at this trust boundary; anything unrecognized falls
 * back to `info`.
 */
function normalizeSeverity(value: unknown): Severity {
  const lower = typeof value === 'string' ? value.toLowerCase() : '';
  return VALID_SEVERITIES.has(lower) ? (lower as Severity) : Severity.INFO;
}

/**
 * The gRPC side of `JobsRegistryService` (`src/proto/jobs_registry.proto`):
 * `Next` / `NextBatch` (claim, secret release check, sealing, the worker
 * wire shape in `mapJobToGrpcJob`) and the `Result*` uploads. Every method
 * is behind `GrpcWorkerTokenGuard` and takes the worker from the token.
 */
@Controller()
export class JobsRegistryGrpcController {
  private readonly logger = new Logger(JobsRegistryGrpcController.name);

  constructor(
    private readonly jobsRegistryService: JobsRegistryService,
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly toolConfigProfilesService: ToolConfigProfilesService,
    private readonly integrationConfig: IntegrationConfigReader,
    private readonly grpcWorkerContext: GrpcWorkerContext,
    private readonly jobDispatch: JobDispatchService,
  ) {}

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'Next')
  async next(
    request: { id: string },
    metadata: Metadata,
  ): Promise<Record<string, unknown>> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const job = await this.jobDispatch.getNextJob(
      authenticatedWorkerId(this.logger, worker, request.id),
    );
    const mapped = job ? await this.mapJobToGrpcJob(job, worker) : null;

    return mapped ?? { id: '', asset: {}, command: '' };
  }

  /**
   * Batched claim. Returns every job this worker can start right now — up to
   * the `limit` it asks for, capped server-side — in one round-trip and one
   * transaction, instead of one `Next` per free concurrency slot.
   *
   * An empty list is the "no work" signal, the same meaning as an empty `id`
   * from `Next`. The worker sizes `limit` from its free slots, so the server
   * never hands back more jobs than it can start.
   */
  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'NextBatch')
  async nextBatch(
    request: { id: string; limit: number },
    metadata: Metadata,
  ): Promise<{ values: Record<string, unknown>[] }> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const jobs = await this.jobDispatch.getNextJobs(
      authenticatedWorkerId(this.logger, worker, request.id),
      Number(request.limit) || 1,
    );

    // Jobs of one step share their config: resolve (and decrypt) each
    // distinct one once for this call, never beyond it.
    const configs: ResolvedConfigs = new Map();
    const mapped = await Promise.all(
      jobs.map((job) => this.mapJobToGrpcJob(job, worker, configs)),
    );

    return { values: mapped.filter((job) => job !== null) };
  }

  /**
   * Inputs of a connector job. A repository asset (GIT_ORG target) gets its
   * clone URL plus the integration's token, decrypted here for this dispatch
   * only — never persisted on the job. Without a usable integration the job
   * still runs, unauthenticated (public repositories).
   */
  private async resolveConnectorInputs(
    job: GetNextJobResult,
  ): Promise<Record<string, string>> {
    const asset = job.asset as unknown as {
      value: string;
      metadata?: Record<string, unknown> | null;
      target?: { type?: string; integrationId?: string | null } | null;
    };
    if (!isRepositoryAsset(asset)) {
      // Jobs planned per service or URL carry their own inputs; older jobs
      // (and host jobs) fall back to the asset.
      return job.inputs ?? buildConnectorInputs(asset);
    }

    const integrationId = asset.target?.integrationId;
    if (!integrationId || !job.workspaceId) {
      return buildConnectorInputs(asset);
    }
    try {
      const { integration, decryptedConfig } =
        await this.integrationConfig.getIntegrationWithDecryptedConfig(
          integrationId,
          job.workspaceId,
        );
      const token = decryptedConfig.apiToken;
      return buildConnectorInputs(
        asset,
        typeof token === 'string' && token
          ? { username: repositoryUsername(integration.appType), token }
          : null,
      );
    } catch {
      // Never log the decrypted payload — generic message only.
      this.logger.warn(
        `repository credentials unavailable for job ${job.id}; dispatching unauthenticated`,
      );
      return buildConnectorInputs(asset);
    }
  }

  /**
   * Maps one claimed job to the gRPC `Job` wire shape. Shared by `Next` and
   * `NextBatch` so the two paths can never drift apart. Null when the job's
   * secrets may not go to this worker: the job is failed instead.
   */
  /**
   * The job's decrypted config, shared with the jobs of the same call that
   * have the same workspace, tool, profile and stored config. The result is
   * only read (packed or sealed), so sharing it is safe.
   */
  private resolveConfig(
    job: GetNextJobResult,
    configs: ResolvedConfigs,
  ): Promise<Record<string, unknown> | undefined> {
    const key = JSON.stringify([
      job.workspaceId,
      job.tool!.id,
      job.configProfileId ?? null,
      job.config ?? null,
    ]);
    let resolved = configs.get(key);
    if (!resolved) {
      resolved = this.toolConfigProfilesService.resolveConfigForJob(
        job.workspaceId!,
        job.tool!.id,
        { config: job.config ?? undefined, configProfileId: job.configProfileId },
      );
      configs.set(key, resolved);
    }
    return resolved;
  }

  private async mapJobToGrpcJob(
    job: GetNextJobResult,
    worker: WorkerInstance,
    configs: ResolvedConfigs = new Map(),
  ): Promise<Record<string, unknown> | null> {
    // Connector path: tool metadata present → look up registry
    const connectorEntry = job.tool
      ? this.connectorRegistry.getConnector(job.tool.name)
      : null;

    if (connectorEntry?.image) {
      const denial = secretReleaseDenial(worker, job);
      if (denial) {
        this.logger.error(
          `job ${job.id} not dispatched to worker ${worker.id}: ${denial}`,
        );
        await this.jobsRegistryService.failUndispatchableJob(
          job.id,
          `Not dispatched: ${denial}`,
        );
        return null;
      }

      let config: Record<string, unknown> | undefined;
      try {
        config = await this.resolveConfig(job, configs);
      } catch {
        // Never log decrypted payload — generic message only
        this.logger.warn('profile decrypt failed');
      }

      // Manifest resource limits — scheduling context for the worker runtime.
      // Keys are camelCase: proto-loader (keepCase: false) drops snake_case.
      const defaults = this.connectorRegistry.getResourceDefaults(
        job.tool!.name,
      );
      const inputs = await this.resolveConnectorInputs(job);

      const response: Record<string, unknown> = {
        id: job.id,
        asset: job.asset,
        category: job.category,
        // The worker derives the connector container name and the in-container
        // TOOL env var from this field, so it must be the manifest slug — the
        // stable identifier connectors are addressed by everywhere else. The
        // display name is long, not unique, and sanitizes into names like
        // "oasm-nikto---web-server-scanner-ghcr-io-00fe". A malformed manifest
        // without a slug falls back to the name so the job still runs.
        tool: connectorEntry.slug || connectorEntry.name,
        image: connectorEntry.image,
        cpu: defaults.cpu,
        memory: defaults.memory,
        timeoutSeconds: defaults.timeoutSeconds,
        directEgress: connectorEntry.egress === 'direct',
        workspaceId: job.workspaceId ?? '',
        configInband: connectorEntry.configInband === true,
        inputs: { fields: packStructFields(inputs) },
      };

      // A worker that registered a key gets every secret sealed to it, and
      // never in the clear: falling back would let a stolen token downgrade.
      if (worker.encryptionPublicKey) {
        const { token, username, ...clearInputs } = inputs;
        try {
          response.sealed = await sealJobSecrets(
            Buffer.from(worker.encryptionPublicKey, 'base64'),
            { config: config ?? {}, inputs: { username, token } },
            job.id,
            worker.id,
          );
        } catch {
          await this.jobsRegistryService.failUndispatchableJob(
            job.id,
            'Not dispatched: the job secrets could not be sealed to the worker key',
          );
          return null;
        }
        response.inputs = { fields: packStructFields(clearInputs) };
        return response;
      }

      if (config && Object.keys(config).length > 0) {
        response.config = { fields: packStructFields(config) };
      }

      return response;
    }

    // Legacy path — byte-for-byte compatible
    return {
      id: job.id,
      asset: job.asset,
      command: job.command,
      category: job.category,
    };
  }

  // --- Deprecated gRPC Method ---

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'Result')
  async result(
    { workerId, data }: { workerId: string; data: UpdateResultDto },
    metadata: Metadata,
  ): Promise<{ success: boolean }> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const transformedData = plainToInstance(UpdateResultDto, data, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    });
    const result = await this.jobsRegistryService.updateResult(
      authenticatedWorkerId(this.logger, worker, workerId),
      transformedData,
    );
    if (!result.jobId)
      return {
        success: false,
      };

    return {
      success: true,
    };
  }

  // --- Category-Specific gRPC Methods ---

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'ResultSubdomains')
  async resultSubdomains({
    workerId,
    jobId,
    error,
    raw,
    assets,
  }: {
    workerId: string;
    jobId: string;
    error: boolean;
    raw?: string;
    assets?: { values: Asset[] };
  }, metadata: Metadata): Promise<{ success: boolean }> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const dto = plainToInstance(SubdomainResultDto, {
      jobId,
      error,
      raw,
      payload: assets?.values,
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      authenticatedWorkerId(this.logger, worker, workerId),
      dto,
      ToolCategory.SUBDOMAINS,
    );
    return { success: !!result.jobId };
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'ResultHttpProbe')
  async resultHttpProbe({
    workerId,
    jobId,
    error,
    raw,
    httpResponse,
  }: {
    workerId: string;
    jobId: string;
    error: boolean;
    raw?: string;
    httpResponse?: HttpResponse;
  }, metadata: Metadata): Promise<{ success: boolean }> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const dto = plainToInstance(HttpProbeResultDto, {
      jobId,
      error,
      raw,
      payload: httpResponse,
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      authenticatedWorkerId(this.logger, worker, workerId),
      dto,
      ToolCategory.HTTP_PROBE,
    );
    return { success: !!result.jobId };
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'ResultPorts')
  async resultPorts({
    workerId,
    jobId,
    error,
    raw,
    numbers,
  }: {
    workerId: string;
    jobId: string;
    error: boolean;
    raw?: string;
    numbers?: { values: number[] };
  }, metadata: Metadata): Promise<{ success: boolean }> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const dto = plainToInstance(PortsResultDto, {
      jobId,
      error,
      raw,
      payload: numbers?.values,
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      authenticatedWorkerId(this.logger, worker, workerId),
      dto,
      ToolCategory.PORTS_SCANNER,
    );
    return { success: !!result.jobId };
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'ResultVulnerabilities')
  async resultVulnerabilities({
    workerId,
    jobId,
    error,
    raw,
    vulnerabilities,
  }: {
    workerId: string;
    jobId: string;
    error: boolean;
    raw?: string;
    vulnerabilities?: { values: Vulnerability[] };
  }, metadata: Metadata): Promise<{ success: boolean }> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const dto = plainToInstance(VulnerabilitiesResultDto, {
      jobId,
      error,
      raw,
      payload: vulnerabilities?.values?.map((vuln) => ({
        ...vuln,
        severity: normalizeSeverity(vuln.severity),
      })),
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      authenticatedWorkerId(this.logger, worker, workerId),
      dto,
      ToolCategory.VULNERABILITIES,
    );
    return { success: !!result.jobId };
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'ResultScreenshot')
  async resultScreenshot({
    workerId,
    jobId,
    error,
    raw,
  }: {
    workerId: string;
    jobId: string;
    error: boolean;
    raw?: string;
  }, metadata: Metadata): Promise<{ success: boolean }> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const dto = plainToInstance(ScreenshotResultDto, {
      jobId,
      error,
      raw,
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      authenticatedWorkerId(this.logger, worker, workerId),
      dto,
      ToolCategory.SCREENSHOT,
    );
    return { success: !!result.jobId };
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'ResultUrlDiscovery')
  async resultUrlDiscovery({
    workerId,
    jobId,
    error,
    raw,
    urls,
  }: {
    workerId: string;
    jobId: string;
    error: boolean;
    raw?: string;
    urls?: DiscoveredUrl[];
  }, metadata: Metadata): Promise<{ success: boolean }> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const dto = plainToInstance(UrlDiscoveryResultDto, {
      jobId,
      error,
      raw,
      payload: urls ?? [],
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      authenticatedWorkerId(this.logger, worker, workerId),
      dto,
      ToolCategory.URL_DISCOVERY,
    );
    return { success: !!result.jobId };
  }
}
