import { Controller, Get, Param } from '@nestjs/common';
import { JobsRegistryService } from './jobs-registry.service';
import { WorkerName } from 'src/common/enums/enum';
import { Public } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetNextJobResponseDto } from './dto/jobs-registry.dto';

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
  getNextJob(@Param('workerId') workerId: string) {
    return this.jobsRegistryService.getNextJob(workerId);
  }
}
