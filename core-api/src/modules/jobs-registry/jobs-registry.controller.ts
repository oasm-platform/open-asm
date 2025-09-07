import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
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
  getManyJobs(@Query() query: GetManyBaseQueryParams) {
    return this.jobsRegistryService.getManyJobs(query);
  }

  @Doc({
    summary: 'Get Jobs Timeline',
    description:
      'Retrieves a timeline of jobs grouped by tool name and target.',
    response: {
      serialization: JobTimelineResponseDto,
    },
  })
  @Get('/timeline')
  getJobsTimeline() {
    return this.jobsRegistryService.getJobsTimeline();
  }

  @Doc({
    summary:
      'Retrieves the next job associated with the given worker that has not yet been started.',
    response: {
      serialization: GetNextJobResponseDto,
    },
  })
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

  @Doc({
    summary:
      'Creates a new job associated with the given asset and worker name.',
  })
  @Post()
  createJobsForTarget(
    @Body() dto: CreateJobsDto,
    // @WorkspaceId() workspaceId: string,
  ) {
    return this.jobsRegistryService.createJobsForTarget(dto);
  }
}
