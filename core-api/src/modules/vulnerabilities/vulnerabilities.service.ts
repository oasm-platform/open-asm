import { Severity } from '@/common/enums/enum';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { ToolsService } from '../tools/tools.service';
import {
  GetVulnerabilitiesSeverityQueryDto,
  VulnerabilitySeverityDto,
} from './dto/get-vulnerability-severity.dto';
import {
  GetVulnerabilitiesStatisticsQueryDto,
  VulnerabilityStatisticsDto,
} from './dto/get-vulnerability-statistics.dto';
import { GetVulnerabilitiesQueryDto } from './dto/get-vulnerability.dto';
import { Vulnerability } from './entities/vulnerability.entity';

@Injectable()
export class VulnerabilitiesService {
  constructor(
    @InjectRepository(Vulnerability)
    private vulnerabilitiesRepository: Repository<Vulnerability>,
    private jobRegistryService: JobsRegistryService,
    private toolsService: ToolsService,
  ) { }

  /**
   * Initiates a vulnerability scan for a given target.
   * This method creates a job in the job registry to start the scanning process.
   *
   * @param targetId - The ID of the target to scan.
   * @returns A message indicating the scan has started.
   */
  public async scan(targetId: string) {
    const tools = await this.toolsService.getToolByNames(['nuclei']);
    await this.jobRegistryService.createNewJob({
      tool: tools[0],
      targetIds: [targetId],
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

    const { sortBy } = query;

    const queryBuilder = this.vulnerabilitiesRepository
      .createQueryBuilder('vulnerabilities')
      .leftJoin('vulnerabilities.asset', 'assets')
      .leftJoin('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspace_targets')
      .leftJoin('workspace_targets.workspace', 'workspaces')
      .leftJoinAndSelect('vulnerabilities.tool', 'tools')
      .leftJoin('vulnerabilities.jobHistory', 'jobHistory')
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
        '"vulnerabilities"."name" ILIKE :q   ',
        {
          q: `%${q}%`,
          qArray: `%${q}%`
        },
      );
    }

    const [vulnerabilities, total] = await queryBuilder.getManyAndCount();

    return getManyResponse({ query, data: vulnerabilities, total });
  }

  /**
   * Retrieves statistics of vulnerabilities by severity level for a specified workspace.
   *
   * @param query - The query parameters to filter vulnerabilities, including workspaceId and optional targetIds.
   * @returns A promise that resolves to an array of vulnerability counts by severity level.
   */
  async getVulnerabilitiesStatistics(
    query: GetVulnerabilitiesStatisticsQueryDto,
  ) {
    const { workspaceId, targetIds } = query;

    const queryBuilder = this.vulnerabilitiesRepository
      .createQueryBuilder('vulnerabilities')
      .select('vulnerabilities.severity', 'severity')
      .addSelect('COUNT(vulnerabilities.severity)', 'count')
      .leftJoin('vulnerabilities.asset', 'assets')
      .leftJoin('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspace_targets')
      .leftJoin('workspace_targets.workspace', 'workspaces')
      .leftJoin('vulnerabilities.jobHistory', 'jobHistory')
      .where('workspaces.id = :workspaceId', { workspaceId })
      // .andWhere(
      //   `(
      //     SELECT MAX(jh."createdAt") 
      //     FROM job_histories jh 
      //     INNER JOIN vulnerabilities v2 ON v2."jobHistoryId" = jh.id
      //     INNER JOIN assets a2 ON v2."assetId" = a2.id
      //     WHERE a2."targetId" = targets.id
      //   ) = "jobHistory"."createdAt"`,
      // )
      .groupBy('vulnerabilities.severity');

    if (targetIds) {
      queryBuilder.andWhere('targets.id IN (:...targetIds)', { targetIds });
    }

    const result = await queryBuilder.getRawMany();

    // Convert the result to a map for easy lookup
    const severityCounts = new Map<Severity, number>();
    result.forEach((item: { severity: Severity; count: string }) => {
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

    const statistics: VulnerabilityStatisticsDto[] = allSeverities.map(
      (severity) => ({
        severity,
        count: severityCounts.get(severity) || 0,
      }),
    );

    return { data: statistics };
  }

  /**
   * Counts the number of vulnerabilities in a workspace.
   *
   * @param workspaceId - The ID of the workspace.
   * @param severity - The severity of the vulnerabilities to count.
   * @returns The count of vulnerabilities in the workspace.
   */
  public async countVulnerabilitiesInWorkspace(workspaceId: string, severity?: string) {
    const queryBuilder = this.vulnerabilitiesRepository
      .createQueryBuilder('vulnerabilities')
      .leftJoin('vulnerabilities.asset', 'assets')
      .leftJoin('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspace_targets')
      .leftJoin('workspace_targets.workspace', 'workspaces')
      .where('workspaces.id = :workspaceId', { workspaceId });

    if (severity) {
      queryBuilder.andWhere('vulnerabilities.severity = :severity', { severity });
    }

    return queryBuilder.getCount();
  }

  /**
   * Retrieves counts of vulnerabilities by severity level for a specified workspace.
   * This method follows the relation path: workspaceId -> target -> assets -> vuls
   *
   * @param query - The query parameters to filter vulnerabilities, including workspaceId and optional targetIds.
   * @returns A promise that resolves to an array of vulnerability counts by severity level.
   */
  async getVulnerabilitiesSeverity(query: GetVulnerabilitiesSeverityQueryDto) {
    const { workspaceId } = query;
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

    const result = await queryBuilder.getRawMany();

    // Convert the result to a map for easy lookup
    const severityCounts = new Map<Severity, number>();
    result.forEach((item: { severity: Severity; count: string }) => {
      severityCounts.set(item.severity, parseInt(item.count, 10));
    });

    // Ensure all severity levels are included, even with zero counts
    const allSeverities: Severity[] = [
      Severity.CRITICAL,
      Severity.HIGH,
      Severity.MEDIUM,
      Severity.LOW,
      Severity.INFO,
    ];

    const severityData: VulnerabilitySeverityDto[] = allSeverities.map(
      (severity) => ({
        severity,
        count: severityCounts.get(severity) || 0,
      }),
    );

    return { data: severityData };
  }
}