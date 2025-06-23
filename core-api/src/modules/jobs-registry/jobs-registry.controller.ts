import { Controller } from '@nestjs/common';
import { JobsRegistryService } from './jobs-registry.service';
import { WorkerName } from 'src/common/enums/enum';

@Controller('jobs-registry')
export class JobsRegistryController {
  constructor(private readonly jobsRegistryService: JobsRegistryService) {}
}
