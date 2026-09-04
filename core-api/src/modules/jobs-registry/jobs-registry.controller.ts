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
import { AuditLog } from '../audit/audit-log.decorator';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { ToolConfigProfilesService } from '../tools/tool-config-profiles.service';
import { GetManyJobsRequestDto } from './dto/get-many-jobs-dto';
import { JobListItemDto } from './dto/job-list-item.dto';
import { JobHistoryDetailResponseDto } from './dto/job-history-detail.dto';
import { JobHistoryResponseDto } from './dto/job-history.dto';
import {
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

@Controller('jobs-registry')
export class JobsRegistryController {
  private readonly logger = new Logger(JobsRegistryController.name);

  constructor(
    private readonly jobsRegistryService: JobsRegistryService,
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly toolConfigProfilesService: ToolConfigProfilesService,
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
    @Query() query: GetManyBaseQueryParams,
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

  @AuditLog('job.cancelled')
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
    worker: { id: string },
  ): Promise<Record<string, unknown>> {
    const job = await this.jobsRegistryService.getNextJob(worker.id);

    if (!job) {
      return { id: '', asset: {}, command: '' };
    }

    // Connector path: tool metadata present → look up registry
    const connectorEntry = job.tool
      ? this.connectorRegistry.getConnector(job.tool.name)
      : null;

    if (connectorEntry?.image) {
      let config: Record<string, unknown> | undefined;
      try {
        config =
          await this.toolConfigProfilesService.resolveConfigForDispatch(
            job.workspaceId!,
            job.tool!.id,
            job.configProfileId,
          );
      } catch {
        // Never log decrypted payload — generic message only
        this.logger.warn('profile decrypt failed');
      }

      const response: Record<string, unknown> = {
        id: job.id,
        asset: job.asset,
        category: job.category,
        tool: connectorEntry.name,
        image: connectorEntry.image,
        inputs: {
          fields: { target: { stringValue: job.asset.value } },
        },
      };

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

}
