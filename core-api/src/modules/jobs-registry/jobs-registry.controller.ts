import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JobsRegistryService } from './jobs-registry.service';
import { Public } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import {
  GetManyJobsQueryParams,
  GetNextJobResponseDto,
  UpdateResultDto,
  WorkerIdParams,
} from './dto/jobs-registry.dto';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';

@Controller('jobs-registry')
export class JobsRegistryController {
  constructor(private readonly jobsRegistryService: JobsRegistryService) {}

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

  @Doc({
    summary:
      'Gets all jobs associated with the given target ID, filtered by status and worker name.',
    response: {
      serialization: GetNextJobResponseDto,
    },
  })
  @Get('/target/:id')
  getJobsByTargetId(
    @Param() { id }: IdQueryParamDto,
    @Query() query: GetManyJobsQueryParams,
  ) {
    return this.jobsRegistryService.getJobsByTargetId(id, query);
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
}
