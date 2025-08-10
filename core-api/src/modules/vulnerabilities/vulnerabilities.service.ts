import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Severity, ToolCategory } from 'src/common/enums/enum';
import { getManyResponse } from 'src/utils/getManyResponse';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { GetVulnerabilitiesQueryDto } from './dto/get-vulnerability.dto';
import { GetVulnerabilitiesStatisticsQueryDto, VulnerabilityStatisticsDto } from './dto/get-vulnerability-statistics.dto';
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
   *                including page, limit, sortOrder, targetIds, workspaceId, and optional search query 'q'.
   * @returns A promise that resolves to a paginated list of vulnerabilities, including total count and pagination information.
   */
  async getVulnerabilities(query: GetVulnerabilitiesQueryDto) {
    const { limit, page, sortOrder, targetIds, workspaceId, q } = query;
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

    // Add search query if provided
    if (q) {
      queryBuilder.andWhere(
        '(vulnerabilities.name ILIKE :q OR ' +
        'vulnerabilities.description ILIKE :q OR ' +
        'vulnerabilities.severity ILIKE :q OR ' +
        'vulnerabilities.affectedUrl ILIKE :q OR ' +
        'vulnerabilities.ipAddress ILIKE :q OR ' +
        'vulnerabilities.host ILIKE :q OR ' +
        'vulnerabilities.port ILIKE :q OR ' +
        'vulnerabilities.cveId ILIKE :q OR ' +
        'vulnerabilities.cweId ILIKE :q OR ' +
        'vulnerabilities.extractorName ILIKE :q)',
        { q: `%${q}%` }
      );
    }

    const [vulnerabilities, total] = await queryBuilder.getManyAndCount();

    return getManyResponse(query, vulnerabilities, total);
  }

  /**
   * Retrieves statistics of vulnerabilities by severity level for a specified workspace.
   *
   * @param query - The query parameters to filter vulnerabilities, including workspaceId and optional targetIds.
   * @returns A promise that resolves to an array of vulnerability counts by severity level.
   */
  async getVulnerabilitiesStatistics(query: GetVulnerabilitiesStatisticsQueryDto) {
    const { workspaceId, targetIds } = query;

    const queryBuilder = this.vulnerabilitiesRepository
      .createQueryBuilder('vulnerabilities')
      .select('vulnerabilities.severity', 'severity')
      .addSelect('COUNT(vulnerabilities.severity)', 'count')
      .leftJoin('vulnerabilities.asset', 'assets')
      .leftJoin('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspace_targets')
      .leftJoin('workspace_targets.workspace', 'workspaces')
      .where('workspaces.id = :workspaceId', { workspaceId })
      .groupBy('vulnerabilities.severity');

    if (targetIds) {
      queryBuilder.andWhere('targets.id IN (:...targetIds)', { targetIds });
    }

    const result = await queryBuilder.getRawMany();

    // Convert the result to a map for easy lookup
    const severityCounts = new Map<string, number>();
    result.forEach(item => {
      severityCounts.set(item.severity, parseInt(item.count, 10));
    });

    // Ensure all severity levels are included, even with zero counts
    const allSeverities: Severity[] = [
      Severity.INFO,
      Severity.LOW,
      Severity.MEDIUM,
      Severity.HIGH,
      Severity.CRITICAL,
    ];

    const statistics: VulnerabilityStatisticsDto[] = allSeverities.map(severity => ({
      severity,
      count: severityCounts.get(severity) || 0,
    }));

    return { data: statistics };
  }
}
