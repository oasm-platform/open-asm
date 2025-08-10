import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ToolCategory } from 'src/common/enums/enum';
import { getManyResponse } from 'src/utils/getManyResponse';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { GetVulnerabilitiesQueryDto } from './dto/get-vulnerability.dto';
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

  /**
   * Retrieves a paginated list of vulnerabilities associated with a specified workspace.
   *
   * @param query - The query parameters to filter and paginate the vulnerabilities,
   *                including page, limit, sortOrder, targetIds, and workspaceId.
   * @returns A promise that resolves to a paginated list of vulnerabilities, including total count and pagination information.
   */
  async getVulnerabilities(query: GetVulnerabilitiesQueryDto) {
    const { limit, page, sortOrder, targetIds, workspaceId } = query;
    let { sortBy } = query;
    if (!(sortBy in Vulnerability)) {
      sortBy = 'createdAt';
    }
    const queryBuilder = this.vulnerabilitiesRepository
      .createQueryBuilder('vulnerabilities')
      .leftJoin('vulnerabilities.asset', 'assets')
      .leftJoin('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspace_targets')
      .leftJoin('workspace_targets.workspace', 'workspaces')
      .where('workspaces.id = :workspaceId', { workspaceId })
      .orderBy(`vulnerabilities.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    if (targetIds) {
      queryBuilder.andWhere('targets.id IN (:...targetIds)', { targetIds });
    }

    const [vulnerabilities, total] = await queryBuilder.getManyAndCount();

    return getManyResponse(query, vulnerabilities, total);
  }
}
