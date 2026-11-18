import { Public, WorkspaceId } from '@/common/decorators/app.decorator';
import { CurrentWorker } from '@/common/decorators/current-worker.decorator';
import { WorkerTokenAuth } from '@/common/decorators/worker-token-auth.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import {
  AuditActorType,
  AuditOutcome,
  Severity,
  ToolCategory,
} from '@/common/enums/enum';
import { GrpcWorkerContext } from '@/common/guards/grpc-worker-context.service';
import { GrpcWorkerTokenGuard } from '@/common/guards/grpc-worker-token.guard';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { GetManyResponseDto } from '@/common/utils/get-many-response.util';
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Metadata } from '@grpc/grpc-js';
import { GrpcMethod } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import { PublishEvent } from '../event-bridge/publishing/publish-event.decorator';
import { Asset } from '../assets/entities/assets.entity';
import { DiscoveredUrl } from '../assets/entities/discovered-url.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { ToolConfigProfilesService } from '../tools/tool-config-profiles.service';
import { getSensitiveFields } from '../tools/validators/tool-config-profiles.crypto';
import { WorkerInstance } from '../workers/entities/worker.entity';
import { secretReleaseDenial } from './job-secret-release.policy';
import { sealJobSecrets } from './job-secret-sealer';
import { WorkflowRunnerService } from './workflow-runner.service';
import {
  buildConnectorInputs,
  isRepositoryAsset,
  repositoryUsername,
} from './connector-inputs';
import { GetManyJobHistoriesRequestDto } from './dto/get-many-job-histories.dto';
import { GetManyJobsRequestDto } from './dto/get-many-jobs.dto';
import { JobListItemDto } from './dto/job-list-item.dto';
import { RetryRunResponseDto } from './dto/retry-run-response.dto';
import { JobHistoryDetailResponseDto } from './dto/job-history-detail.dto';
import { JobHistoryResponseDto } from './dto/job-history.dto';
import { JobHistoryWorkflowResponseDto } from './dto/job-history-workflow.dto';
import {
  GetNextJobResponseDto,
  GetNextJobResult,
  HttpProbeResultDto,
  JobTimelineResponseDto,
  PortsResultDto,
  ScreenshotResultDto,
  SubdomainResultDto,
  UpdateResultDto,
  UrlDiscoveryResultDto,
  VulnerabilitiesResultDto,
  WorkerIdParams,
} from './dto/jobs-registry.dto';
import { JobsRegistryService } from './jobs-registry.service';

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

@Controller('jobs-registry')
export class JobsRegistryController {
  private readonly logger = new Logger(JobsRegistryController.name);

  constructor(
    private readonly jobsRegistryService: JobsRegistryService,
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly toolConfigProfilesService: ToolConfigProfilesService,
    private readonly integrationsService: IntegrationsService,
    private readonly workflowRunnerService: WorkflowRunnerService,
    private readonly grpcWorkerContext: GrpcWorkerContext,
    private readonly eventBridge: EventBridgeService,
  ) {}

  @WorkspaceAccess('job.read')
  @Doc({
    summary: 'Get Jobs',
    description: 'Retrieves a list of jobs that the user is a member of.',
    response: {
      serialization: GetManyResponseDto(JobListItemDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('')
  getManyJobs(
    @WorkspaceId() workspaceId: string,
    @Query() query: GetManyJobsRequestDto,
  ) {
    return this.jobsRegistryService.getManyJobs(workspaceId, query);
  }

  @WorkspaceAccess('job.read')
  @Doc({
    summary: 'Get Jobs Timeline',
    description:
      'Retrieves a timeline of jobs grouped by tool name and target.',
    response: {
      serialization: JobTimelineResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/timeline')
  getJobsTimeline(@WorkspaceId() workspaceId: string) {
    return this.jobsRegistryService.getJobsTimeline(workspaceId);
  }

  @Doc({
    summary:
      'Retrieves the next job associated with the given worker that has not yet been started.',
    response: {
      serialization: GetNextJobResponseDto,
    },
  })
  @WorkerTokenAuth()
  @Public()
  @Get('/:workerId/next')
  async getNextJob(
    @Param() { workerId }: WorkerIdParams,
    @CurrentWorker() worker: WorkerInstance,
  ) {
    const job = await this.jobsRegistryService.getNextJob(
      this.authenticatedWorkerId(worker, workerId),
    );
    return job;
  }

  @Doc({ summary: 'Updates the result of a job with the given worker ID.' })
  /**
   * @deprecated Use category-specific endpoints instead
   */
  @WorkerTokenAuth()
  @Public()
  @Post('/:workerId/result')
  updateResult(
    @Param() { workerId }: WorkerIdParams,
    @Body() dto: UpdateResultDto,
    @CurrentWorker() worker: WorkerInstance,
  ) {
    return this.jobsRegistryService.updateResult(
      this.authenticatedWorkerId(worker, workerId),
      dto,
    );
  }

  // --- Category-Specific Result Endpoints ---

  @Doc({
    summary: 'Updates subdomain scan results',
    description: 'Submit subdomain discovery results for a job',
  })
  @WorkerTokenAuth()
  @Public()
  @Post('/:workerId/result/subdomains')
  updateSubdomainResult(
    @Param() { workerId }: WorkerIdParams,
    @Body() dto: SubdomainResultDto,
    @CurrentWorker() worker: WorkerInstance,
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      this.authenticatedWorkerId(worker, workerId),
      dto,
      ToolCategory.SUBDOMAINS,
    );
  }

  @Doc({
    summary: 'Updates HTTP probe results',
    description: 'Submit HTTP probe scan results for a job',
  })
  @WorkerTokenAuth()
  @Public()
  @Post('/:workerId/result/http-probe')
  updateHttpProbeResult(
    @Param() { workerId }: WorkerIdParams,
    @Body() dto: HttpProbeResultDto,
    @CurrentWorker() worker: WorkerInstance,
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      this.authenticatedWorkerId(worker, workerId),
      dto,
      ToolCategory.HTTP_PROBE,
    );
  }

  @Doc({
    summary: 'Updates port scan results',
    description: 'Submit port scanner results for a job',
  })
  @WorkerTokenAuth()
  @Public()
  @Post('/:workerId/result/ports')
  updatePortsResult(
    @Param() { workerId }: WorkerIdParams,
    @Body() dto: PortsResultDto,
    @CurrentWorker() worker: WorkerInstance,
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      this.authenticatedWorkerId(worker, workerId),
      dto,
      ToolCategory.PORTS_SCANNER,
    );
  }

  @Doc({
    summary: 'Updates vulnerability scan results',
    description: 'Submit vulnerability scan results for a job',
  })
  @WorkerTokenAuth()
  @Public()
  @Post('/:workerId/result/vulnerabilities')
  updateVulnerabilitiesResult(
    @Param() { workerId }: WorkerIdParams,
    @Body() dto: VulnerabilitiesResultDto,
    @CurrentWorker() worker: WorkerInstance,
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      this.authenticatedWorkerId(worker, workerId),
      dto,
      ToolCategory.VULNERABILITIES,
    );
  }

  @Doc({
    summary: 'Updates screenshot results',
    description: 'Submit screenshot capture results for a job',
  })
  @WorkerTokenAuth()
  @Public()
  @Post('/:workerId/result/screenshot')
  updateScreenshotResult(
    @Param() { workerId }: WorkerIdParams,
    @Body() dto: ScreenshotResultDto,
    @CurrentWorker() worker: WorkerInstance,
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      this.authenticatedWorkerId(worker, workerId),
      dto,
      ToolCategory.SCREENSHOT,
    );
  }

  @Doc({
    summary: 'Updates URL discovery results',
    description: 'Submit discovered URLs for a job',
  })
  @WorkerTokenAuth()
  @Public()
  @Post('/:workerId/result/url-discovery')
  updateUrlDiscoveryResult(
    @Param() { workerId }: WorkerIdParams,
    @Body() dto: UrlDiscoveryResultDto,
    @CurrentWorker() worker: WorkerInstance,
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      this.authenticatedWorkerId(worker, workerId),
      dto,
      ToolCategory.URL_DISCOVERY,
    );
  }

  @WorkspaceAccess('job.read')
  @Doc({
    summary: 'Get Many Job Histories',
    description:
      'Retrieves a list of job histories in the current workspace with their associated jobs, assets, and targets.',
    response: {
      serialization: GetManyResponseDto(JobHistoryResponseDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/histories')
  getManyJobHistories(
    @WorkspaceId() workspaceId: string,
    @Query() query: GetManyJobHistoriesRequestDto,
  ): Promise<GetManyBaseResponseDto<JobHistoryResponseDto>> {
    return this.jobsRegistryService.getManyJobHistories(workspaceId, query);
  }

  @WorkspaceAccess('job.read')
  @Doc({
    summary: 'Get Job History Detail',
    description:
      'Retrieves a job history detail with its associated workflow and jobs.',
    response: {
      serialization: JobHistoryDetailResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/histories/:id')
  getJobHistoryDetail(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<JobHistoryDetailResponseDto> {
    return this.jobsRegistryService.getJobHistoryDetail(workspaceId, id);
  }

  @WorkspaceAccess('job.read')
  @Doc({
    summary: 'Get Job History Workflow',
    description:
      'Retrieves the workflow definition a run was created from, as JSON and as YAML, with the step state of that run.',
    response: {
      serialization: JobHistoryWorkflowResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/histories/:id/workflow')
  getJobHistoryWorkflow(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<JobHistoryWorkflowResponseDto> {
    return this.jobsRegistryService.getJobHistoryWorkflow(workspaceId, id);
  }

  @WorkspaceAccess('job.write')
  @Doc({
    summary: 'Re-run a job',
    description:
      'Reset job status to pending, clear workerId, and increment retry count',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('/:id/re-run')
  reRunJob(
    @WorkspaceId() workspaceId: string,
    @Param() params: IdQueryParamDto,
  ) {
    return this.jobsRegistryService.reRunJob(workspaceId, params.id);
  }

  @PublishEvent(EVENT_CATALOG.job.cancelled)
  @WorkspaceAccess('job.write')
  @Doc({
    summary: 'Cancel a job',
    description: 'Cancel a job by its ID in the specified workspace',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('/:id/cancel')
  cancelJob(
    @WorkspaceId() workspaceId: string,
    @Param() params: IdQueryParamDto,
  ) {
    return this.jobsRegistryService.cancelJob(workspaceId, params.id);
  }

  @PublishEvent(EVENT_CATALOG.job.cancelled)
  @WorkspaceAccess('job.write')
  @Doc({
    summary: 'Cancel a job history',
    description:
      'Cancels every job of a run that has not reached a terminal state and stops the workflow from spawning further steps',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('/histories/:id/cancel')
  cancelJobHistory(
    @WorkspaceId() workspaceId: string,
    @Param() params: IdQueryParamDto,
  ) {
    return this.jobsRegistryService.cancelJobHistory(workspaceId, params.id);
  }

  @WorkspaceAccess('job.write')
  @Doc({
    summary: 'Retry a run',
    description:
      'Starts a new run from the same workflow and scope as an existing run, leaving the original run untouched.',
    response: {
      serialization: RetryRunResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('/histories/:id/re-run')
  retryJobHistory(
    @WorkspaceId() workspaceId: string,
    @Param() params: IdQueryParamDto,
  ): Promise<RetryRunResponseDto> {
    return this.workflowRunnerService.retryRun(workspaceId, params.id);
  }

  @WorkspaceAccess('job.delete')
  @Doc({
    summary: 'Delete a job',
    description: 'Delete a job by its ID in the specified workspace',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Delete('/:id')
  deleteJob(
    @WorkspaceId() workspaceId: string,
    @Param() params: IdQueryParamDto,
  ) {
    return this.jobsRegistryService.deleteJob(workspaceId, params.id);
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'Next')
  async next(
    request: { id: string },
    metadata: Metadata,
  ): Promise<Record<string, unknown>> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const job = await this.jobsRegistryService.getNextJob(
      this.authenticatedWorkerId(worker, request.id),
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
    const jobs = await this.jobsRegistryService.getNextJobs(
      this.authenticatedWorkerId(worker, request.id),
      Number(request.limit) || 1,
    );

    const mapped = await Promise.all(
      jobs.map((job) => this.mapJobToGrpcJob(job, worker)),
    );

    return { values: mapped.filter((job) => job !== null) };
  }

  /**
   * The id of the worker the guard authenticated. Old workers send their own
   * id in the request, so a different one is logged and never used: a valid
   * token must not claim jobs, or submit results, as another worker.
   */
  private authenticatedWorkerId(
    worker: WorkerInstance,
    claimedId?: string,
  ): string {
    if (claimedId && claimedId !== worker.id) {
      this.logger.warn(
        `worker ${worker.id} sent worker id ${claimedId}; using its own`,
      );
    }
    return worker.id;
  }

  /**
   * Audits a dispatch that hands the worker credentials: which fields, never
   * their values. A job without secrets records nothing.
   */
  private async recordSecretRelease(
    job: GetNextJobResult,
    worker: WorkerInstance,
    sensitiveFields: string[],
    config: Record<string, unknown> | undefined,
    inputs: Record<string, string>,
  ): Promise<void> {
    const fields = sensitiveFields.filter((field) => config?.[field]);
    if (inputs.token) fields.push('inputs.token');
    if (fields.length === 0 || !job.workspaceId) return;

    await this.eventBridge.publishSafely(
      EVENT_CATALOG.job.secrets.released,
      {
        workspaceId: job.workspaceId,
        actor: { type: AuditActorType.System, id: worker.id, name: worker.name },
        outcome: AuditOutcome.Success,
        resourceType: 'job',
        resourceId: job.id,
        metadata: { workerId: worker.id, fields },
      },
      { subject: `workspace:${job.workspaceId}/job:${job.id}` },
    );
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
        await this.integrationsService.getIntegrationWithDecryptedConfig(
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
  private async mapJobToGrpcJob(
    job: GetNextJobResult,
    worker: WorkerInstance,
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
        config =
          await this.toolConfigProfilesService.resolveConfigForJob(
            job.workspaceId!,
            job.tool!.id,
            { config: job.config ?? undefined, configProfileId: job.configProfileId },
          );
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
      await this.recordSecretRelease(
        job,
        worker,
        getSensitiveFields(connectorEntry.configSchema),
        config,
        inputs,
      );

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
      this.authenticatedWorkerId(worker, workerId),
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
      this.authenticatedWorkerId(worker, workerId),
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
      this.authenticatedWorkerId(worker, workerId),
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
      this.authenticatedWorkerId(worker, workerId),
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
      this.authenticatedWorkerId(worker, workerId),
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
      this.authenticatedWorkerId(worker, workerId),
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
      this.authenticatedWorkerId(worker, workerId),
      dto,
      ToolCategory.URL_DISCOVERY,
    );
    return { success: !!result.jobId };
  }

}
