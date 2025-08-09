import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ToolCategory } from 'src/common/enums/enum';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { Vulnerability } from './entities/vulnerability.entity';

@Injectable()
export class VulnerabilitiesService {
  constructor(
    @InjectRepository(Vulnerability)
    private vulnerabilitiesRepository: Repository<Vulnerability>,

    private jobRegistryService: JobsRegistryService,
    private assetService: AssetsService,
  ) {}

  async scan(targetId: string) {
    const assets = await this.assetService.assetRepo.find({
      where: {
        target: {
          id: targetId,
        },
        isErrorPage: false,
      },
    });

    if (!assets.length) {
      throw new NotFoundException('Assets not found');
    }

    this.jobRegistryService.startNextJob({
      assets,
      nextJob: [ToolCategory.VULNERABILITIES],
    });

    return { message: `Scanning target ${targetId}...` };
  }
}
