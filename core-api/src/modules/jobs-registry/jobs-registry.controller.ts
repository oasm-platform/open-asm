import { Public, WorkspaceId } from '@/common/decorators/app.decorator';
import { CurrentWorker } from '@/common/decorators/current-worker.decorator';
import { WorkerTokenAuth } from '@/common/decorators/worker-token-auth.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { ToolCategory } from '@/common/enums/enum';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { GetManyResponseDto } from '@/common/utils/get-many-response.util';
import { Body, Controller, Delete, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { PublishEvent } from '../event-bridge/publishing/publish-event.decorator';
import { WorkerInstance } from '../workers/entities/worker.entity';
import { WorkflowRunnerService } from './workflow-runner.service';
import { GetManyJobHistoriesRequestDto } from './dto/get-many-job-histories.dto';
import { GetManyJobsRequestDto } from './dto/get-many-jobs.dto';
import { JobListItemDto } from './dto/job-list-item.dto';
import { RetryRunResponseDto } from './dto/retry-run-response.dto';
import { JobHistoryDetailResponseDto } from './dto/job-history-detail.dto';
import { JobHistoryResponseDto } from './dto/job-history.dto';
import { JobHistoryWorkflowResponseDto } from './dto/job-history-workflow.dto';
import { GetNextJobResponseDto, HttpProbeResultDto, JobTimelineResponseDto, PortsResultDto, ScreenshotResultDto, SubdomainResultDto, UpdateResultDto, UrlDiscoveryResultDto, VulnerabilitiesResultDto, WorkerIdParams } from './dto/jobs-registry.dto';
import { JobDispatchService } from './job-dispatch.service';
import { JobHistoryQueryService } from './job-history-query.service';
import { JobsRegistryService } from './jobs-registry.service';
import { authenticatedWorkerId } from './worker-identity';

@Controller('jobs-registry')
export class JobsRegistryController {
  private readonly logger = new Logger(JobsRegistryController.name);

  constructor(
    private readonly jobsRegistryService: JobsRegistryService,
    private readonly workflowRunnerService: WorkflowRunnerService,
    private readonly jobHistoryQuery: JobHistoryQueryService,
    private readonly jobDispatch: JobDispatchService,
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
    return this.jobHistoryQuery.getJobsTimeline(workspaceId);
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
    const job = await this.jobDispatch.getNextJob(
      authenticatedWorkerId(this.logger, worker, workerId),
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
      authenticatedWorkerId(this.logger, worker, workerId),
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
      authenticatedWorkerId(this.logger, worker, workerId),
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
      authenticatedWorkerId(this.logger, worker, workerId),
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
      authenticatedWorkerId(this.logger, worker, workerId),
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
      authenticatedWorkerId(this.logger, worker, workerId),
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
      authenticatedWorkerId(this.logger, worker, workerId),
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
      authenticatedWorkerId(this.logger, worker, workerId),
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
    return this.jobHistoryQuery.getManyJobHistories(workspaceId, query);
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
    return this.jobHistoryQuery.getJobHistoryDetail(workspaceId, id);
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
    return this.jobHistoryQuery.getJobHistoryWorkflow(workspaceId, id);
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

}
