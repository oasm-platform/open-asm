import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { JobsRegistryService } from './jobs-registry.service';
import { WorkerName } from 'src/common/enums/enum';
import { Public } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import {
  GetNextJobResponseDto,
  UpdateResultDto,
  WorkerIdParams,
} from './dto/jobs-registry.dto';

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

  @Doc({ summary: 'Updates the result of a job with the given worker ID.' })
  @Public()
  @Post('/:workerId/result')
  updateResult(
    @Body() dto: UpdateResultDto,
    @Param() { workerId }: WorkerIdParams,
  ) {
    return this.jobsRegistryService.updateResult(workerId, dto);
  }
}
