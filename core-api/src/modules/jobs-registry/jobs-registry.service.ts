import { Injectable } from '@nestjs/common';
import { WorkerName } from 'src/common/enums/enum';

@Injectable()
export class JobsRegistryService {
  public static workerSteps = [
    {
      id: WorkerName.SUBFINDER,
      description: 'Fast passive subdomain enumeration tool.',
    },
    {
      id: WorkerName.NAABU,
      description: 'Scan open ports and detect running services on each port.',
    },
    {
      id: WorkerName.DNSX,
      description:
        'Perform DNS resolution and enumeration to gather additional information about subdomains and their associated IP addresses.',
    },
  ];
}
