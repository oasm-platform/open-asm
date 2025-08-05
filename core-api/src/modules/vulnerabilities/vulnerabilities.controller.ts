import { Controller } from '@nestjs/common';
import { VulnerabilitiesService } from './vulnerabilities.service';
@Controller('vulnerabilities')
export class VulnerabilitiesController {
  constructor(
    private readonly vulnerabilitiesService: VulnerabilitiesService,
  ) {}
}
