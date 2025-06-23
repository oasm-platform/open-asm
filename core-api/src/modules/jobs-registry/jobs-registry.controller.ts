import { Controller } from '@nestjs/common';
import { JobsRegistryService } from './jobs-registry.service';
import { WorkerName } from 'src/common/enums/enum';

@Controller('jobs-registry')
export class JobsRegistryController {
  constructor(private readonly jobsRegistryService: JobsRegistryService) {}

  public static workerSteps = [
    {
      id: WorkerName.SCAN_SUB_DOMAINS,
      name: 'Scan Subdomains',
      description: 'Enumerate subdomains of a target domain.',
    },
    {
      id: WorkerName.SCAN_PORTS_AND_SERVICES,
      name: 'Scan Ports and Services',
      description: 'Scan open ports and detect running services on each port.',
    },
    {
      id: WorkerName.WEB_INSPECTION,
      name: 'Web Inspection',
      description:
        'Collect web metadata such as titles, screenshots, and detect frontend/backend technologies.',
    },
  ];
}
