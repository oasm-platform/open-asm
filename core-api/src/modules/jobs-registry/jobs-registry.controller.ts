import { Public, WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkerTokenAuth } from '@/common/decorators/worker-token-auth.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { Severity, ToolCategory } from '@/common/enums/enum';
import { GrpcWorkerTokenGuard } from '@/common/guards/grpc-worker-token.guard';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { GetManyResponseDto } from '@/utils/getManyResponse';
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
import { GrpcMethod } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { PublishEvent } from '../event-bridge/publishing/publish-event.decorator';
import { Asset } from '../assets/entities/assets.entity';
import { DiscoveredUrl } from '../assets/entities/discovered-url.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { GetManyJobHistoriesRequestDto } from './dto/get-many-job-histories-dto';
import { GetManyJobsRequestDto } from './dto/get-many-jobs-dto';
import { JobListItemDto } from './dto/job-list-item.dto';
import { JobHistoryDetailResponseDto } from './dto/job-history-detail.dto';
import { JobHistoryResponseDto } from './dto/job-history.dto';
import { JobHistoryWorkflowResponseDto } from './dto/job-history-workflow.dto';
import {
  GetNextJobResponseDto,
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
  async getNextJob(@Param() { workerId }: WorkerIdParams) {
    const job = await this.jobsRegistryService.getNextJob(workerId);
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
  ) {
    return this.jobsRegistryService.updateResult(workerId, dto);
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
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      workerId,
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
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      workerId,
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
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      workerId,
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
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      workerId,
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
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      workerId,
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
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      workerId,
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
  async next(worker: { id: string }): Promise<Record<string, unknown>> {
    const job = await this.jobsRegistryService.getNextJob(worker.id);

    if (!job) {
      return { id: '', asset: {}, command: '' };
    }

    return this.jobsRegistryService.toGrpcJob(job);
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
  async nextBatch(request: {
    id: string;
    limit: number;
  }): Promise<{ values: Record<string, unknown>[] }> {
    const jobs = await this.jobsRegistryService.getNextJobs(
      request.id,
      Number(request.limit) || 1,
    );

    const values = await Promise.all(
      jobs.map((job) => this.jobsRegistryService.toGrpcJob(job)),
    );

    return { values };
  }

  // --- Deprecated gRPC Method ---

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'Result')
  async result({
    workerId,
    data,
  }: {
    workerId: string;
    data: UpdateResultDto;
  }): Promise<{ success: boolean }> {
    const transformedData = plainToInstance(UpdateResultDto, data, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    });
    const result = await this.jobsRegistryService.updateResult(
      workerId,
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
  }): Promise<{ success: boolean }> {
    const dto = plainToInstance(SubdomainResultDto, {
      jobId,
      error,
      raw,
      payload: assets?.values,
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      workerId,
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
  }): Promise<{ success: boolean }> {
    const dto = plainToInstance(HttpProbeResultDto, {
      jobId,
      error,
      raw,
      payload: httpResponse,
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      workerId,
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
  }): Promise<{ success: boolean }> {
    const dto = plainToInstance(PortsResultDto, {
      jobId,
      error,
      raw,
      payload: numbers?.values,
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      workerId,
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
  }): Promise<{ success: boolean }> {
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
      workerId,
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
  }): Promise<{ success: boolean }> {
    const dto = plainToInstance(ScreenshotResultDto, {
      jobId,
      error,
      raw,
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      workerId,
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
  }): Promise<{ success: boolean }> {
    const dto = plainToInstance(UrlDiscoveryResultDto, {
      jobId,
      error,
      raw,
      payload: urls ?? [],
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      workerId,
      dto,
      ToolCategory.URL_DISCOVERY,
    );
    return { success: !!result.jobId };
  }

}
