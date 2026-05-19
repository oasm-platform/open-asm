import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { BullMQName, CronSchedule, JobStatus, TargetScopeType } from '@/common/enums/enum';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { getManyResponse } from '@/utils/getManyResponse';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { Asset } from '../assets/entities/assets.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  BulkTargetResultDto,
  CreateMultipleTargetsDto,
  GetManyWorkspaceQueryParamsDto,
  UpdateTargetDto,
} from './dto/targets.dto';
import { Target, TargetType } from './entities/target.entity';
import { WorkspaceTarget } from './entities/workspace-target.entity';

@Injectable()
export class TargetsService implements OnModuleInit {
  constructor(
    @InjectRepository(Target)
    private readonly repo: Repository<Target>,
    @InjectRepository(WorkspaceTarget)
    private readonly workspaceTargetRepository: Repository<WorkspaceTarget>,
    private readonly workspacesService: WorkspacesService,
    public assetService: AssetsService,
    private eventEmitter: EventEmitter2,
    @InjectQueue(BullMQName.ASSETS_DISCOVERY_SCHEDULE)
    private scanScheduleQueue: Queue<Target>,
  ) {}

  async onModuleInit() {
    await this.handleUpdateScanSchedule();
  }

  /**
   * Validates a target value based on its type.
   * For DOMAIN: Must be a valid root domain (not an IP address).
   * For CIDR: Must be a valid CIDR notation with /24 prefix only and public IP.
   * For IP: Must be a valid public IPv4 address.
   *
   * @param value - The target value to validate.
   * @param type - The type of target (DOMAIN, CIDR, or IP).
   * @throws BadRequestException if validation fails.
   */
  private validateTargetValue(
    value: string,
    type: TargetType,
    isInternalNetwork: boolean = false,
  ): void {
    if (type === TargetType.DOMAIN) {
      // Validate root domain: must not be an IP address
      const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      if (ipRegex.test(value)) {
        throw new BadRequestException(
          `Invalid domain: "${value}" is an IP address. Use type IP for single IP addresses or CIDR for IP ranges.`,
        );
      }

      // Validate domain format: must be a valid root domain
      const domainRegex = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
      if (!domainRegex.test(value)) {
        throw new BadRequestException(
          `Invalid domain: "${value}" is not a valid root domain.`,
        );
      }
    } else if (type === TargetType.CIDR) {
      // Validate CIDR notation format: x.x.x.x/y
      const cidrRegex =
        /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
      const match = value.match(cidrRegex);

      if (!match) {
        throw new BadRequestException(
          `Invalid CIDR: "${value}" is not a valid CIDR notation. Expected format: x.x.x.x/y`,
        );
      }

      // Validate each octet is 0-255
      const octets = [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3]),
        parseInt(match[4]),
      ];
      for (const octet of octets) {
        if (octet < 0 || octet > 255) {
          throw new BadRequestException(
            `Invalid CIDR: "${value}" contains invalid IP octet. Each octet must be 0-255.`,
          );
        }
      }

      // Validate prefix is exactly /24
      const prefix = parseInt(match[5]);
      if (prefix !== 24) {
        throw new BadRequestException(
          `Invalid CIDR: "${value}" must use /24 prefix. Only /24 CIDR ranges are supported.`,
        );
      }

      // Validate IP is public (not private/localhost/reserved) unless it's an internal network
      if (!isInternalNetwork && this.isPrivateIP(octets[0], octets[1])) {
        throw new BadRequestException(
          `Invalid CIDR: "${value}" is a private/reserved IP range. Only public IP ranges are allowed.`,
        );
      }
    } else if (type === TargetType.IP) {
      // Validate single IP address format: x.x.x.x
      const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const match = value.match(ipRegex);

      if (!match) {
        throw new BadRequestException(
          `Invalid IP: "${value}" is not a valid IPv4 address. Expected format: x.x.x.x`,
        );
      }

      // Validate each octet is 0-255
      const octets = [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3]),
        parseInt(match[4]),
      ];
      for (const octet of octets) {
        if (octet < 0 || octet > 255) {
          throw new BadRequestException(
            `Invalid IP: "${value}" contains invalid IP octet. Each octet must be 0-255.`,
          );
        }
      }

      // Validate IP is public (not private/localhost/reserved) unless it's an internal network
      if (!isInternalNetwork && this.isPrivateIP(octets[0], octets[1])) {
        throw new BadRequestException(
          `Invalid IP: "${value}" is a private/reserved IP address. Only public IP addresses are allowed.`,
        );
      }
    }
  }

  /**
   * Checks if an IP address is private, reserved, or localhost.
   *
   * @param firstOctet - First octet of IP address
   * @param secondOctet - Second octet of IP address
   * @returns true if IP is private/reserved/localhost
   */
  private isPrivateIP(firstOctet: number, secondOctet: number): boolean {
    // 127.0.0.0/8 - Loopback (localhost)
    if (firstOctet === 127) return true;

    // 10.0.0.0/8 - Private
    if (firstOctet === 10) return true;

    // 172.16.0.0/12 - Private (172.16.0.0 - 172.31.255.255)
    if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31)
      return true;

    // 192.168.0.0/16 - Private
    if (firstOctet === 192 && secondOctet === 168) return true;

    // 169.254.0.0/16 - Link-local
    if (firstOctet === 169 && secondOctet === 254) return true;

    // 224.0.0.0/4 - Multicast
    if (firstOctet >= 224 && firstOctet <= 239) return true;

    // 240.0.0.0/4 - Reserved
    if (firstOctet >= 240 && firstOctet <= 255) return true;

    // 0.0.0.0/8 - "This" network
    if (firstOctet === 0) return true;

    return false;
  }

  /**
   * Expands a CIDR /24 notation to an array of 256 IP addresses.
   *
   * @param cidr - CIDR notation (e.g., "192.168.1.0/24")
   * @returns Array of 256 IP addresses
   */
  private expandCIDRToIPs(cidr: string): string[] {
    const match = cidr.match(
      /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/24$/,
    );
    if (!match) {
      throw new BadRequestException(`Invalid CIDR format: ${cidr}`);
    }

    const baseOctets = [
      parseInt(match[1]),
      parseInt(match[2]),
      parseInt(match[3]),
    ];

    const ips: string[] = [];
    for (let i = 0; i < 256; i++) {
      ips.push(`${baseOctets[0]}.${baseOctets[1]}.${baseOctets[2]}.${i}`);
    }

    return ips;
  }

  /**
   * Retrieves a target entity by its ID.
   *
   * @param id - The ID of the target to retrieve.
   * @returns A promise that resolves to the target entity if found, otherwise null.
   */
  public async getTargetById(id: string, workspaceId: string): Promise<Target> {
    const result = (await this.repo
      .createQueryBuilder('targets')
      .leftJoin('targets.workspaceTargets', 'workspaceTarget')
      .leftJoin('workspaceTarget.workspace', 'workspace')
      .leftJoin('workspace.workspaceMembers', 'workspaceMember')
      .leftJoin('targets.assets', 'asset')
      .leftJoin('asset.assetServices', 'assetService')
      .leftJoin('asset.jobs', 'job')
      .where('targets.id = :id', { id })
      .andWhere('workspace.id = :workspaceId', { workspaceId })
      .select([
        'targets.id as id',
        'targets.value as value',
        'targets.type as type',
        'targets.lastDiscoveredAt as "lastDiscoveredAt"',
        `COALESCE(COUNT(DISTINCT CASE WHEN "assetService"."isErrorPage" = false THEN "assetService"."id" END), 0) AS "totalAssetServices"`,
        'targets.scanSchedule as "scanSchedule"',
        `CASE
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.IN_PROGRESS}' THEN 1 END) > 0 THEN '${JobStatus.IN_PROGRESS}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.PENDING}' THEN 1 END) > 0 THEN '${JobStatus.PENDING}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.COMPLETED}' THEN 1 END) > 0 THEN '${JobStatus.COMPLETED}'
        ELSE '${JobStatus.COMPLETED}'
      END AS status`,
      ])
      .groupBy(
        'targets.id, targets.value, targets.type, targets.lastDiscoveredAt, targets.scanSchedule',
      )
      .getRawOne()) as Target;

    return result;
  }

  /**
   * Creates multiple targets in a single transaction, skipping duplicates.
   *
   * @param dto - The data transfer object containing array of target details.
   * @param workspaceId - The ID of the workspace to associate targets with.
   * @param userContext - The user's context data, which includes the user's ID.
   * @returns A promise that resolves to bulk creation result with created targets and skipped values.
   */
  public async createMultipleTargets(
    dto: CreateMultipleTargetsDto,
    workspaceId: string,
    userContext: UserContextPayload,
    internalNetworkId?: string,
  ): Promise<BulkTargetResultDto> {
    const { targets } = dto;

    // Validate all targets before processing
    for (const target of targets) {
      const type = target.type || TargetType.DOMAIN;
      this.validateTargetValue(target.value, type, !!internalNetworkId);
    }

    // Check if the workspace exists and the user is the owner
    await this.workspacesService.getWorkspaceByIdAndOwner(
      workspaceId,
      userContext,
    );

    const targetValues = targets.map((t) => t.value);

    // Use transaction to ensure atomicity
    const result = await this.repo.manager.transaction(
      async (transactionalEntityManager) => {
        // Query all existing workspace targets for the given values in one query
        const existingWorkspaceTargets = await transactionalEntityManager
          .getRepository(WorkspaceTarget)
          .createQueryBuilder('wt')
          .innerJoin('wt.target', 'target')
          .where('wt.workspace = :workspaceId', { workspaceId })
          .andWhere('target.value IN (:...values)', { values: targetValues })
          .select([
            'target.value AS value',
            'target.internalNetworkId AS internalNetworkId',
          ])
          .getRawMany<{ value: string; internalNetworkId: string | null }>();

        const existingTargetsMap = new Map<string, Set<string | null>>();
        existingWorkspaceTargets.forEach((et) => {
          if (!existingTargetsMap.has(et.value)) {
            existingTargetsMap.set(et.value, new Set());
          }
          existingTargetsMap.get(et.value)!.add(et.internalNetworkId);
        });

        // Check for duplicates and throw error immediately if any found
        const duplicateValues: string[] = [];
        const newTargets = targets.filter((t) => {
          const networks = existingTargetsMap.get(t.value);
          if (!networks) return true;

          // External target: check if value exists in ANY network or as external
          if (!internalNetworkId) {
            duplicateValues.push(t.value);
            return false;
          }

          // Internal target: only skip if same value AND same network
          const isDuplicate = networks.has(internalNetworkId);
          if (isDuplicate) {
            duplicateValues.push(t.value);
          }
          return !isDuplicate;
        });

        if (duplicateValues.length > 0) {
          throw new BadRequestException(
            `Target already exists: ${duplicateValues.join(', ')}`,
          );
        }

        const skippedValues: string[] = [];

        const createdTargets: Target[] = [];

        if (newTargets.length === 0) {
          return {
            created: createdTargets,
            skipped: skippedValues,
            totalRequested: targets.length,
            totalCreated: 0,
            totalSkipped: skippedValues.length,
          };
        }

        // Batch insert new targets
        const insertResult = await transactionalEntityManager
          .createQueryBuilder()
          .insert()
          .into(Target)
          .values(
            newTargets.map((t) => ({
              value: t.value,
              type: t.type || TargetType.DOMAIN,
              internalNetworkId: internalNetworkId,
            })),
          )
          .execute();

        // Get all created target IDs
        const targetIds = insertResult.identifiers.map((id) => id.id as string);

        // Fetch all created targets
        const createdTargetEntities = await transactionalEntityManager
          .getRepository(Target)
          .findByIds(targetIds);

        // Create workspace target associations in batch
        const workspaceTargetValues = createdTargetEntities.map((target) => ({
          workspace: { id: workspaceId },
          target: { id: target.id },
        }));

        await transactionalEntityManager
          .getRepository(WorkspaceTarget)
          .save(workspaceTargetValues);

        // Create primary assets for all new targets using batch UPSERT
        const assetValues: Array<{
          id: string;
          target: { id: string };
          value: string;
          isPrimary: boolean;
        }> = [];

        for (const target of createdTargetEntities) {
          if (target.type === TargetType.CIDR) {
            // Generate 256 IPs for CIDR /24
            const ips = this.expandCIDRToIPs(target.value);
            ips.forEach((ip, index) => {
              assetValues.push({
                id: randomUUID(),
                target: { id: target.id },
                value: ip,
                isPrimary: index === 0, // First IP is primary
              });
            });
          } else if (target.type === TargetType.IP) {
            // For IP, create single asset record (similar to CIDR but only 1)
            assetValues.push({
              id: randomUUID(),
              target: { id: target.id },
              value: target.value,
              isPrimary: true,
            });
          } else {
            // For DOMAIN, create single asset
            assetValues.push({
              id: randomUUID(),
              target: { id: target.id },
              value: target.value,
              isPrimary: true,
            });
          }
        }

        await transactionalEntityManager
          .createQueryBuilder()
          .insert()
          .into(Asset)
          .values(assetValues)
          .orIgnore()
          .execute();

        return {
          created: createdTargetEntities,
          skipped: skippedValues,
          totalRequested: targets.length,
          totalCreated: createdTargetEntities.length,
          totalSkipped: skippedValues.length,
        };
      },
    );

    // Emit events and update scan schedules for all created targets (outside transaction)
    for (const target of result.created) {
      const typeToEvent = target.type.toLocaleLowerCase(); // e.g. DOMAIN -> domain, CIDR -> cidr
      this.eventEmitter.emit(`target.${typeToEvent}.create`, target);
    }

    return result;
  }

  /**
   * Retrieves a paginated list of targets associated with a specified workspace.
   *
   * @param id - The ID of the workspace for which to retrieve targets.
   * @param query - The query parameters to filter and paginate the targets.
   * @returns A promise that resolves to a paginated list of targets, including total count and pagination information.
   */
  public async getTargetsInWorkspace(
    query: GetManyWorkspaceQueryParamsDto,
    workspaceId: string,
  ): Promise<
    GetManyBaseResponseDto<
      Target & { totalAssetServices: number; status: string; duration: number }
    >
  > {
    const { limit, page, sortBy, sortOrder, value, type, status, scope } = query;

    const offset = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('targets')
      .innerJoin('targets.workspaceTargets', 'workspaceTarget')
      .innerJoin('workspaceTarget.workspace', 'workspace')
      .innerJoin('workspace.workspaceMembers', 'workspaceMember')
      .leftJoin('targets.assets', 'asset')
      .leftJoin('asset.assetServices', 'assetService')
      .leftJoin('asset.jobs', 'job')
      .where('workspace.id = :workspaceId', { workspaceId })
      .select([
        'targets.id as id',
        'targets.value as value',
        'targets.type as type',
        'targets.lastDiscoveredAt as "lastDiscoveredAt"',
        'targets.reScanCount as "reScanCount"',
        'targets.scanSchedule as "scanSchedule"',
        'targets.internalNetworkId as "internalNetworkId"',
        `CAST(COUNT(DISTINCT CASE WHEN "assetService"."isErrorPage" = false THEN "assetService"."id" END) AS INTEGER) AS "totalAssetServices"`,
        `CASE
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.IN_PROGRESS}' THEN 1 END) > 0 THEN '${JobStatus.IN_PROGRESS}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.PENDING}' THEN 1 END) > 0 THEN '${JobStatus.PENDING}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.COMPLETED}' THEN 1 END) > 0 THEN '${JobStatus.COMPLETED}'
        ELSE '${JobStatus.COMPLETED}'
      END AS status`,
      ])
      .groupBy('targets.id');

    if (value) {
      queryBuilder.andWhere('targets.value LIKE :value', {
        value: `%${value}%`,
      });
    }

    if (type) {
      queryBuilder.andWhere('targets.type = :type', { type });
    }

if (status) {
      // Filter by computed status using HAVING clause
      const statusCase = `CASE
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.IN_PROGRESS}' THEN 1 END) > 0 THEN '${JobStatus.IN_PROGRESS}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.PENDING}' THEN 1 END) > 0 THEN '${JobStatus.PENDING}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.COMPLETED}' THEN 1 END) > 0 THEN '${JobStatus.COMPLETED}'
        ELSE '${JobStatus.COMPLETED}'
      END`;

      if (status === JobStatus.COMPLETED) {
        queryBuilder.having(
          `(${statusCase}) = :status OR (COUNT(job.id) = 0 AND :status = '${JobStatus.COMPLETED}')`,
          { status },
        );
      } else {
        queryBuilder.having(`(${statusCase}) = :status`, { status });
      }
    }

if (scope !== undefined) {
      if (scope === TargetScopeType.INTERNAL) {
        queryBuilder.andWhere('targets.internalNetworkId IS NOT NULL');
      } else {
        queryBuilder.andWhere('targets.internalNetworkId IS NULL');
      }
    }

    if (sortBy === 'totalAssetServices' || sortBy === 'duration') {
      queryBuilder.orderBy(`"${sortBy}"`, sortOrder);
    } else if (sortBy in Target) {
      queryBuilder.orderBy(`targets.${sortBy}`, sortOrder);
    } else {
      queryBuilder.orderBy('targets.createdAt', sortOrder);
    }

    const total = await queryBuilder.getCount();

    const targets = await queryBuilder.limit(limit).offset(offset).getRawMany();

    return getManyResponse({ query, data: targets, total });
  }

  /**
   * Deletes a target from a workspace, but only if the requesting user is the owner of the workspace.
   *
   * @param id - The ID of the target to be deleted.
   * @param workspaceId - The ID of the workspace from which the target will be deleted.
   * @param userContext - The user's context data, which includes the user's ID.
   * @throws NotFoundException if the target is not found in the workspace.
   * @returns A response indicating the target was successfully deleted.
   */
  public async deleteTargetFromWorkspace(
    id: string,
    workspaceId: string,
    userContext: UserContextPayload,
  ) {
    await this.workspacesService.getWorkspaceByIdAndOwner(
      workspaceId,
      userContext,
    );

    const workspaceTarget = await this.workspaceTargetRepository.findOneBy({
      target: { id },
      workspace: { id: workspaceId },
    });

    await this.repo.delete(id);

    if (!workspaceTarget) {
      throw new NotFoundException('Target not found in workspace');
    }

    await this.workspaceTargetRepository.delete({
      target: { id },
      workspace: { id: workspaceId },
    });

    return { message: 'Target deleted successfully' };
  }

  /**
   * Updates a target.
   *
   * @param id - The ID of the target to be updated.
   * @param dto - The data transfer object containing the target details to be updated.
   * @throws NotFoundException if the target is not found.
   * @returns The updated target entity.
   */
  public async updateTarget(id: string, dto: UpdateTargetDto) {
    const target = await this.repo.findOneBy({ id });
    if (!target) {
      throw new NotFoundException('Target not found');
    }

    let jobId: string | undefined;
    // If scanSchedule was updated, also update the job in BullMQ
    if (dto.scanSchedule !== undefined) {
      const job = await this.updateTargetScanScheduleJob(
        target,
        dto.scanSchedule,
      );
      if (job) {
        jobId = job.repeatJobKey;
      }
    }

    // Update the target in the database
    const result = await this.repo.update(id, {
      ...dto,
      jobId,
    });

    return result;
  }

  /**
   * Handles scheduling of targets for rescan based on their scan schedules.
   *
   * This function is scheduled to run every day at 00:00.
   * It retrieves all targets with a scan schedule, and adds a new BullMQ job for each target.
   * The BullMQ job will trigger a rescan of the target every time it runs according to its cron schedule.
   */

  private async updateTargetScanScheduleJob(
    target: Target,
    scanSchedule: CronSchedule,
  ): Promise<Job<Target> | null> {
    // Remove any existing jobs for this target
    if (target.jobId) {
      await this.scanScheduleQueue.removeJobScheduler(target.jobId);
    }
    if (scanSchedule !== CronSchedule.DISABLED) {
      const job = await this.scanScheduleQueue.add(
        target.id, // Job name is the target ID
        { id: target.id } as Target,
        {
          repeat: {
            pattern: scanSchedule,
          },
        },
      );

      return job;
    }
    return null;
  }

  /**
   * Handles updating scan schedules for all targets.
   */
  async handleUpdateScanSchedule(): Promise<void> {
    const targetSchedules = await this.repo
      .createQueryBuilder('target')
      .select(['target.value', 'target.id', 'target.scanSchedule'])
      .where('target.scanSchedule IS NOT NULL')
      .andWhere('target.jobId IS NULL')
      .getMany();

    if (targetSchedules.length === 0) return;

    // Add new jobs to the queue with targetId as job name and cron schedule
    for (const target of targetSchedules) {
      const job = await this.updateTargetScanScheduleJob(
        target,
        target.scanSchedule,
      );
      if (job) {
        await this.repo.update(target.id, { jobId: job.repeatJobKey });
      }
    }
  }

  /**
   * Export targets data for CSV export in a specific workspace
   * Returns array of targets with value, lastDiscoveredAt, and createdAt fields
   */
  public async exportTargetsForCSV(workspaceId: string): Promise<
    Array<{
      value: string;
      type: string;
      lastDiscoveredAt: Date;
      createdAt: Date;
    }>
  > {
    const targets = await this.repo
      .createQueryBuilder('targets')
      .innerJoin('targets.workspaceTargets', 'workspaceTarget')
      .innerJoin('workspaceTarget.workspace', 'workspace')
      .where('workspace.id = :workspaceId', { workspaceId })
      .select([
        'targets.value as value',
        'targets.type as type',
        'targets.lastDiscoveredAt as "lastDiscoveredAt"',
        'targets.createdAt as "createdAt"',
      ])
      .orderBy('targets.createdAt', 'ASC')
      .getRawMany<{
        value: string;
        type: string;
        lastDiscoveredAt: Date;
        createdAt: Date;
      }>();

    return targets;
  }
}
