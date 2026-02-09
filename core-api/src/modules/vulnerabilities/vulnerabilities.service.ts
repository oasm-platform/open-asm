import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { Severity } from '@/common/enums/enum';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { ToolsService } from '../tools/tools.service';
import { WorkflowsService } from '../workflows/workflows.service';
import {
  GetVulnerabilitiesStatisticsQueryDto,
  VulnerabilityStatisticsDto,
} from './dto/get-vulnerability-statistics.dto';
import {
  GetVulnerabilitiesQueryDto,
  VulnerabilityStatus,
} from './dto/get-vulnerability.dto';
import { VulnerabilityDismissal } from './entities/vulnerability-dismissal.entity';
import { Vulnerability } from './entities/vulnerability.entity';

@Injectable()
export class VulnerabilitiesService {
  constructor(
    @InjectRepository(Vulnerability)
    private vulnerabilitiesRepository: Repository<Vulnerability>,
    @InjectRepository(VulnerabilityDismissal)
    private dismissRepo: Repository<VulnerabilityDismissal>,
    private jobRegistryService: JobsRegistryService,
    private toolsService: ToolsService,
    private workflowService: WorkflowsService,
  ) {}

  /**
   * Initiates a vulnerability scan for a given target.
   * This method creates a job in the job registry to start the scanning process.
   *
   * @param targetId - The ID of the target to scan.
   * @returns A message indicating the scan has started.
   */
  public async scan(targetId: string, workspaceId: string) {
    const tools = await this.toolsService.getToolByNames({ names: ['nuclei'] });
    const workflow = await this.workflowService.workflowRepository.findOne({
      where: {
        workspace: {
          id: workspaceId,
        },
        filePath: 'vuls-scan-basic.yaml',
      },
    });

    if (!workflow) {
      throw new NotFoundException(
        'Vulnerability scanning workflow not found in the workspace.',
      );
    }

    await this.jobRegistryService.createNewJob({
      tool: tools[0],
      workflow,
      targetIds: [targetId],
      priority: tools[0].priority,
      workspaceId,
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
    const {
      limit,
      page,
      sortOrder,
      targetIds,
      workspaceId,
      q,
      status,
      severity,
      createdFrom,
      createdTo,
    } = query;

    const { sortBy } = query;

    const queryBuilder = this.vulnerabilitiesRepository
      .createQueryBuilder('vulnerabilities')
      .leftJoin('vulnerabilities.asset', 'assets')
      .leftJoin('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspace_targets')
      .leftJoin('workspace_targets.workspace', 'workspaces')
      .leftJoinAndSelect('vulnerabilities.tool', 'tools')
      .leftJoin('vulnerabilities.jobHistory', 'jobHistory')
      .leftJoinAndSelect('vulnerabilities.vulnerabilityDismissal', 'dismissal')
      .where('workspaces.id = :workspaceId', { workspaceId })
      .skip((page - 1) * limit)
      .take(limit);

    // Handle severity sorting with proper order
    if (sortBy === 'severity') {
      const { select, orderBy } = this.buildSeverityOrderQuery(sortOrder);
      queryBuilder.addSelect(select, 'severity_order').orderBy(orderBy, 'ASC');
    } else {
      queryBuilder.orderBy(`vulnerabilities.${sortBy}`, sortOrder);
    }

    if (targetIds) {
      queryBuilder.andWhere('targets.id IN (:...targetIds)', { targetIds });
    }

    // Add search query if provided
    if (q) {
      queryBuilder.andWhere('"vulnerabilities"."name" ILIKE :q   ', {
        q: `%${q}%`,
        qArray: `%${q}%`,
      });
    }

    // Filter by status
    if (status === VulnerabilityStatus.OPEN) {
      queryBuilder.andWhere('dismissal.vulnerabilityId IS NULL');
    } else if (status === VulnerabilityStatus.DISMISSED) {
      queryBuilder.andWhere('dismissal.vulnerabilityId IS NOT NULL');
    }

    // Filter by severity levels
    if (Array.isArray(severity) && severity.length > 0) {
      queryBuilder.andWhere('vulnerabilities.severity IN (:...severity)', {
        severity,
      });
    }

    // Filter by creation date range
    if (createdFrom) {
      queryBuilder.andWhere('vulnerabilities.createdAt >= :createdFrom', {
        createdFrom: new Date(createdFrom),
      });
    }
    if (createdTo) {
      // Set time to end of day (23:59:59.999) to include the entire day
      const endDate = new Date(createdTo);
      endDate.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('vulnerabilities.createdAt <= :createdTo', {
        createdTo: endDate,
      });
    }

    const [vulnerabilities, total] = await queryBuilder.getManyAndCount();

    return getManyResponse({ query, data: vulnerabilities, total });
  }

  /**
   * Retrieves a vulnerability by id
   *
   * @param id - The ID of the vulnerability to retrieve.
   * @param workspaceId - The ID of the workspace to which the vulnerability belongs.
   * @returns A promise that resolves to the vulnerability entity.
   */
  async getVulnerability(id: string, workspaceId: string) {
    const queryBuilder = this.vulnerabilitiesRepository
      .createQueryBuilder('vulnerabilities')
      .leftJoin('vulnerabilities.asset', 'assets')
      .leftJoin('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspace_targets')
      .leftJoin('workspace_targets.workspace', 'workspaces')
      .leftJoinAndSelect('vulnerabilities.tool', 'tools')
      .leftJoin('vulnerabilities.jobHistory', 'jobHistory')
      .leftJoinAndSelect('vulnerabilities.vulnerabilityDismissal', 'dismissal')
      .leftJoinAndSelect('dismissal.user', 'user')
      .where('workspaces.id = :workspaceId', { workspaceId })
      .andWhere('vulnerabilities.id = :id', { id });

    const vulnerability = await queryBuilder.getOneOrFail();

    return vulnerability;
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
      .leftJoin('vulnerabilities.vulnerabilityDismissal', 'dismissal')
      .where('workspaces.id = :workspaceId', { workspaceId })
      // Only show open vulnerabilities (not dismissed)
      .andWhere('dismissal.vulnerabilityId IS NULL')
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
   * Updates the isArchived status of a vulnerability.
   *
   * @param id - The ID of the vulnerability to update.
   * @param isArchived - The new boolean value for isArchived.
   * @returns A promise that resolves when the update is complete.
   */
  async markIsArchived(id: string, isArchived: boolean): Promise<void> {
    await this.vulnerabilitiesRepository.update({ id }, { isArchived });
  }

  /**
   * Builds the SQL CASE expression for severity ordering.
   *
   * @param sortOrder - The sort order ('ASC' or 'DESC').
   * @returns An object containing the select expression and order by field.
   */
  private buildSeverityOrderQuery(sortOrder: SortOrder | undefined): {
    select: string;
    orderBy: string;
  } {
    const severityCase =
      sortOrder === SortOrder.ASC
        ? `CASE vulnerabilities.severity WHEN '${Severity.INFO}' THEN 1 WHEN '${Severity.LOW}' THEN 2 WHEN '${Severity.MEDIUM}' THEN 3 WHEN '${Severity.HIGH}' THEN 4 WHEN '${Severity.CRITICAL}' THEN 5 END`
        : `CASE vulnerabilities.severity WHEN '${Severity.INFO}' THEN 5 WHEN '${Severity.LOW}' THEN 4 WHEN '${Severity.MEDIUM}' THEN 3 WHEN '${Severity.HIGH}' THEN 2 WHEN '${Severity.CRITICAL}' THEN 1 END`;

    return {
      select: severityCase,
      orderBy: 'severity_order',
    };
  }

  async bulkDismissVulnerabilities(
    ids: string[],
    workspaceId: string,
    user: User,
    dismiss: { reason: VulnerabilityDismissal['reason']; comment?: string },
  ) {
    // Validate all vulnerabilities exist and belong to the workspace
    const vulnerabilities = await this.vulnerabilitiesRepository.find({
      where: {
        id: In(ids),
        asset: {
          target: { workspaceTargets: { workspace: { id: workspaceId } } },
        },
      },
    });

    const foundIds = vulnerabilities.map((v) => v.id);
    const notFoundIds = ids.filter((id) => !foundIds.includes(id));
    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `Vulnerabilities not found: ${notFoundIds.join(', ')}`,
      );
    }

    // Check which are already dismissed
    const alreadyDismissed = await this.dismissRepo.find({
      where: {
        vulnerabilityId: In(ids),
      },
    });

    if (alreadyDismissed.length > 0) {
      throw new BadRequestException(
        `Vulnerabilities already dismissed: ${alreadyDismissed.map((d) => d.vulnerabilityId).join(', ')}`,
      );
    }

    // Create dismissal records for all
    const dismissals = ids.map((id) =>
      this.dismissRepo.create({
        vulnerabilityId: id,
        userId: user.id,
        reason: dismiss.reason,
        comment: dismiss.comment,
      }),
    );

    await this.dismissRepo.save(dismissals);
    return dismissals;
  }

  async bulkReopenVulnerabilities(ids: string[], workspaceId: string) {
    const dismissals = await this.dismissRepo.find({
      where: {
        id: In(ids),
        vulnerability: {
          asset: {
            target: {
              workspaceTargets: {
                workspace: {
                  id: workspaceId,
                },
              },
            },
          },
        },
      },
    });

    const foundIds = dismissals.map((d) => d.id);
    const notFoundIds = ids.filter((id) => !foundIds.includes(id));
    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `Dismissed vulnerabilities not found: ${notFoundIds.join(', ')}`,
      );
    }

    await this.dismissRepo.delete({ id: In(ids) });
  }
}
