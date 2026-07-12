import { Public, WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkerTokenAuth } from '@/common/decorators/worker-token-auth.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { ToolCategory } from '@/common/enums/enum';
import { GrpcWorkerTokenGuard } from '@/common/guards/grpc-worker-token.guard';
import { WorkspaceOwnerGuard } from '@/common/guards/workspace-owner.guard';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { AssetTag } from '../assets/entities/asset-tags.entity';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { GetManyJobsRequestDto } from './dto/get-many-jobs-dto';
import { JobHistoryDetailResponseDto } from './dto/job-history-detail.dto';
import { JobHistoryResponseDto } from './dto/job-history.dto';
import {
  AssistantResultDto,
  ClassifierResultDto,
  GetNextJobResponseDto,
  HttpProbeResultDto,
  JobTimelineResponseDto,
  PortsResultDto,
  ScreenshotResultDto,
  SubdomainResultDto,
  UpdateResultDto,
  VulnerabilitiesResultDto,
  WorkerIdParams,
} from './dto/jobs-registry.dto';
import { Job } from './entities/job.entity';
import { JobsRegistryService } from './jobs-registry.service';

@Controller('jobs-registry')
export class JobsRegistryController {
  constructor(private readonly jobsRegistryService: JobsRegistryService) {}

  @Doc({
    summary: 'Get Jobs',
    description: 'Retrieves a list of jobs that the user is a member of.',
    response: {
      serialization: GetManyResponseDto(Job),
    },
  })
  @Get('')
  getManyJobs(@Query() query: GetManyJobsRequestDto) {
    return this.jobsRegistryService.getManyJobs(query);
  }

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
    summary: 'Updates classifier results',
    description: 'Submit asset classification results for a job',
  })
  @Public()
  @Post('/:workerId/result/classifier')
  updateClassifierResult(
    @Param() { workerId }: WorkerIdParams,
    @Body() dto: ClassifierResultDto,
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      workerId,
      dto,
      ToolCategory.CLASSIFIER,
    );
  }

  @Doc({
    summary: 'Updates assistant results',
    description: 'Submit AI assistant results for a job',
  })
  @Public()
  @Post('/:workerId/result/assistant')
  updateAssistantResult(
    @Param() { workerId }: WorkerIdParams,
    @Body() dto: AssistantResultDto,
  ) {
    return this.jobsRegistryService.updateResultByCategory(
      workerId,
      dto,
      ToolCategory.ASSISTANT,
    );
  }

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
    @Query() query: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<JobHistoryResponseDto>> {
    return this.jobsRegistryService.getManyJobHistories(workspaceId, query);
  }

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

  @UseGuards(WorkspaceOwnerGuard)
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

  @UseGuards(WorkspaceOwnerGuard)
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

  @UseGuards(WorkspaceOwnerGuard)
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
  async next(worker: {
    id: string;
  }): Promise<{ id: string; asset: Asset; command?: string }> {
    const job = await this.jobsRegistryService.getNextJob(worker.id);

    if (!job) {
      return { id: '', asset: {} as Asset, command: '' };
    }

    return {
      id: job.id,
      asset: job.asset,
      command: job.command,
    };
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
      payload: vulnerabilities?.values,
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
  @GrpcMethod('JobsRegistryService', 'ResultClassifier')
  async resultClassifier({
    workerId,
    jobId,
    error,
    raw,
    assetTags,
  }: {
    workerId: string;
    jobId: string;
    error: boolean;
    raw?: string;
    assetTags?: { values: AssetTag[] };
  }): Promise<{ success: boolean }> {
    const dto = plainToInstance(ClassifierResultDto, {
      jobId,
      error,
      raw,
      payload: assetTags?.values,
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      workerId,
      dto,
      ToolCategory.CLASSIFIER,
    );
    return { success: !!result.jobId };
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('JobsRegistryService', 'ResultAssistant')
  async resultAssistant({
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
    const dto = plainToInstance(AssistantResultDto, {
      jobId,
      error,
      raw,
    });
    const result = await this.jobsRegistryService.updateResultByCategory(
      workerId,
      dto,
      ToolCategory.ASSISTANT,
    );
    return { success: !!result.jobId };
  }
}
