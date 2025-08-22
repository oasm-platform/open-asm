import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import {
  GetNextJobResponseDto,
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

  // @Doc({
  //   summary: 'Gets jobs by asset ID, filtered by status and worker name.',
  //   response: {
  //     serialization: GetManyResponseDto(Job),
  //   },
  // })
  // @Get('/asset/:assetId')
  // getJobsByAssetId(
  //   @Param('assetId', new ParseUUIDPipe()) assetId: string,
  //   @Query() query: GetManyJobsQueryParams,
  // ) {
  //   return this.jobsRegistryService.getJobsByAssetId(assetId, query);
  // }

  // @Doc({
  //   summary: 'Gets jobs by target ID, filtered by status and worker name.',
  //   response: {
  //     serialization: GetManyResponseDto(Job),
  //   },
  // })
  // @Get('/target/:targetId')
  // getJobsByTargetId(
  //   @Param('targetId', new ParseUUIDPipe()) targetId: string,
  //   @Query() query: GetManyJobsQueryParams,
  // ) {
  //   return this.jobsRegistryService.getJobsByTargetId(targetId, query);
  // }

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
