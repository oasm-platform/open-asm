import { Public, WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkerTokenAuth } from '@/common/decorators/worker-token-auth.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
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
import { GetManyJobsRequestDto } from './dto/get-many-jobs-dto';
import { JobHistoryDetailResponseDto } from './dto/job-history-detail.dto';
import { JobHistoryResponseDto } from './dto/job-history.dto';
import {
  CreateJobsDto,
  GetNextJobResponseDto,
  JobTimelineResponseDto,
  UpdateResultDto,
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
  getNextJob(@Param() { workerId }: WorkerIdParams) {
    return this.jobsRegistryService.getNextJob(workerId);
  }

  @Doc({ summary: 'Updates the result of a job with the given worker ID.' })
  @Public()
  @Post('/:workerId/result')
  updateResult(
    @Param() { workerId }: WorkerIdParams,
    @Body() dto: UpdateResultDto,
  ) {
    return this.jobsRegistryService.updateResult(workerId, dto);
  }

  @UseGuards(WorkspaceOwnerGuard)
  @Doc({
    summary:
      'Creates a new job associated with the given asset and worker name.',
    request: {
      getWorkspaceId: true,
    },
  })
  @Post()
  createJobsForTarget(
    @Body() dto: CreateJobsDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.jobsRegistryService.createJobsForTarget(dto, workspaceId);
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
  }): Promise<{ id: string; asset: string; command?: string }> {
    const job = await this.jobsRegistryService.getNextJob(worker.id);

    if (!job) {
      return { id: '', asset: '', command: '' };
    }

    return {
      id: job.id,
      asset: job.asset,
      command: job.command,
    };
  }

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
}
