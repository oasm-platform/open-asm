import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { BullMQName, CronSchedule, JobRunType, JobStatus } from '@/common/enums/enum';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { JobHistory } from '../jobs-registry/entities/job-history.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { ToolsService } from '../tools/tools.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import { AssetGroupLastRunDto } from './dto/asset-group-last-run.dto';
import { AssetGroupWorkflow } from './entities/asset-groups-workflows.entity';
import { AssetGroup } from './entities/asset-groups.entity';

@Injectable()
export class AssetGroupWorkflowService {
  private readonly logger = new Logger(AssetGroupWorkflowService.name);
  constructor(
    @InjectRepository(AssetGroup)
    private readonly assetGroupRepo: Repository<AssetGroup>,
    @InjectRepository(AssetGroupWorkflow)
    private readonly assetGroupWorkflowRepo: Repository<AssetGroupWorkflow>,
    @InjectRepository(Workflow)
    private readonly workflowRepo: Repository<Workflow>,
    @InjectRepository(JobHistory)
    private readonly jobHistoryRepo: Repository<JobHistory>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
    @InjectQueue(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
    private scanScheduleQueue: Queue<AssetGroupWorkflow>,
    private toolsService: ToolsService,
    private jobRegistryService: JobsRegistryService,
  ) {}

  /**
   * Resolves the most recent job history per workflow,
   * deriving each status from the individual job statuses.
   */
  async getLastRunForWorkflows(
    workflowIds: string[],
  ): Promise<Map<string, AssetGroupLastRunDto>> {
    if (workflowIds.length === 0) {
      return new Map();
    }

    interface RawJobHistoryRow {
      workflowId: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      totalJobs: string;
      status: JobStatus;
      workflowName: string;
      jobHistoryName: string;
      jobRunType: JobRunType;
    }

    const raw = await this.jobHistoryRepo
      .createQueryBuilder('jobHistory')
      .leftJoin('jobHistory.workflow', 'workflow')
      .where('jobHistory.workflowId IN (:...workflowIds)', { workflowIds })
      .select([
        '"jobHistory"."workflowId" as "workflowId"',
        '"jobHistory".id as "id"',
        '"jobHistory"."createdAt" as "createdAt"',
        '"jobHistory"."updatedAt" as "updatedAt"',
        '"jobHistory"."jobHistoryName" as "jobHistoryName"',
        '"jobHistory"."jobRunType" as "jobRunType"',
        '"workflow"."name" as "workflowName"',
        // Subquery to count total jobs for this job history
        '(SELECT COUNT(*) FROM jobs WHERE "jobHistoryId" = "jobHistory".id) as "totalJobs"',
        // Subquery with CASE to calculate status based on job statuses
        `(
          SELECT
            CASE
              WHEN COUNT(*) FILTER (WHERE status = '${JobStatus.FAILED}') > 0 THEN '${JobStatus.FAILED}'
              WHEN COUNT(*) FILTER (WHERE status = '${JobStatus.IN_PROGRESS}') > 0 THEN '${JobStatus.IN_PROGRESS}'
              WHEN COUNT(*) FILTER (WHERE status = '${JobStatus.COMPLETED}') = COUNT(*) AND COUNT(*) > 0 THEN '${JobStatus.COMPLETED}'
              ELSE '${JobStatus.PENDING}'
            END
          FROM jobs
          WHERE "jobHistoryId" = "jobHistory".id
        ) as "status"`,
      ])
      .distinctOn(['"jobHistory"."workflowId"'])
      .orderBy('"jobHistory"."workflowId"')
      .addOrderBy('jobHistory.createdAt', 'DESC')
      .getRawMany<RawJobHistoryRow>();

    const lastRunByWorkflow = new Map<string, AssetGroupLastRunDto>();

    for (const row of raw) {
      // A job history with zero job rows (e.g. all jobs were deleted) is not
      // a meaningful "last run": the status CASE falls through to 'pending',
      // which would wrongly lock the group out of re-running. Skip it so the
      // UI falls back to "Never".
      if (parseInt(row.totalJobs, 10) === 0) {
        continue;
      }

      lastRunByWorkflow.set(row.workflowId, {
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        totalJobs: parseInt(row.totalJobs, 10),
        status: row.status,
        workflowName: row.workflowName,
        jobHistoryName: row.jobHistoryName,
        jobRunType: row.jobRunType,
      });
    }

    return lastRunByWorkflow;
  }

  /**
   * Associates multiple workflows with the specified asset group
   */
  async addManyWorkflows(
    groupId: string,
    workflowIds: string[],
    schedule: string = CronSchedule.EVERY_3_DAYS,
    workspaceId?: string,
  ): Promise<DefaultMessageResponseDto> {
    try {
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id: groupId },
        relations: ['workspace'],
      });
      if (!assetGroup) {
        this.logger.warn(`Asset group with ID "${groupId}" not found`);
        throw new NotFoundException(
          `Asset group with ID "${groupId}" not found`,
        );
      }
      if (workspaceId && assetGroup.workspace?.id !== workspaceId) {
        throw new ForbiddenException(
          'Group does not belong to this workspace',
        );
      }

      // Verify that all workflows exist
      const workflows = await this.workflowRepo.findByIds(workflowIds);
      if (workflows.length !== workflowIds.length) {
        const foundWorkflowIds = workflows.map((workflow) => workflow.id);
        const missingWorkflowIds = workflowIds.filter(
          (id) => !foundWorkflowIds.includes(id),
        );
        this.logger.warn(
          `Workflows with IDs "${missingWorkflowIds.join(', ')}" not found`,
        );
        throw new NotFoundException(
          `One or more workflows with IDs "${missingWorkflowIds.join(', ')}" not found`,
        );
      }

      // Find existing associations to avoid duplicates
      const existingAssociations = await this.assetGroupWorkflowRepo.find({
        where: {
          assetGroup: { id: groupId },
          workflow: { id: In(workflowIds) },
        },
      });

      const existingWorkflowIds = existingAssociations.map(
        (assoc) => assoc.workflow.id,
      );
      if (existingWorkflowIds.length > 0) {
        this.logger.warn(
          `Workflows with IDs "${existingWorkflowIds.join(', ')}" are already associated with asset group "${groupId}"`,
        );
        throw new BadRequestException(
          `Workflows with IDs "${existingWorkflowIds.join(', ')}" are already associated with asset group "${groupId}"`,
        );
      }
      const assetGroupWorkflowRecords: AssetGroupWorkflow[] = [];

      for (const workflowId of workflowIds) {
        const assetGroupWorkflowId = randomUUID();
        // 'disabled' is not a valid BullMQ repeat pattern (cron-parser would
        // reject it), so only register a scheduler for real schedules.
        let jobId: string | null = null;
        if (schedule !== 'disabled') {
          const job = await this.scanScheduleQueue.add(
            assetGroupWorkflowId,
            { id: assetGroupWorkflowId } as AssetGroupWorkflow,
            {
              repeat: {
                pattern: schedule,
              },
            },
          );
          jobId = job.repeatJobKey ?? null;
        }

        const record = this.assetGroupWorkflowRepo.create({
          id: assetGroupWorkflowId,
          assetGroup: { id: groupId },
          workflow: { id: workflowId },
          schedule,
          jobId,
        });

        assetGroupWorkflowRecords.push(record);
      }

      await this.assetGroupWorkflowRepo.save(assetGroupWorkflowRecords);

      return {
        message: `${assetGroupWorkflowRecords.length} workflows successfully added to asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error adding workflows to asset group with ID ${groupId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Disassociates multiple workflows from the asset group
   */
  async removeManyWorkflows(
    groupId: string,
    workflowIds: string[],
    workspaceId?: string,
  ): Promise<DefaultMessageResponseDto> {
    try {
      // Validate group exists and belongs to the workspace
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id: groupId },
        relations: ['workspace'],
      });
      if (!assetGroup) {
        throw new NotFoundException(
          `Asset group with ID "${groupId}" not found`,
        );
      }
      if (workspaceId && assetGroup.workspace?.id !== workspaceId) {
        throw new ForbiddenException(
          'Group does not belong to this workspace',
        );
      }

      // Find existing associations
      const associations = await this.assetGroupWorkflowRepo.find({
        where: {
          assetGroup: { id: groupId },
          workflow: { id: In(workflowIds) },
        },
        relations: ['workflow', 'assetGroup'],
      });

      if (associations.length === 0) {
        this.logger.warn(
          `No workflows with IDs "${workflowIds.join(', ')}" are associated with asset group "${groupId}"`,
        );
        throw new NotFoundException(
          `No workflows with IDs "${workflowIds.join(', ')}" are associated with asset group "${groupId}"`,
        );
      }

      // Check for missing associations
      const associatedWorkflowIds = associations.map(
        (assoc) => assoc.workflow.id,
      );
      const missingWorkflowIds = workflowIds.filter(
        (id) => !associatedWorkflowIds.includes(id),
      );
      if (missingWorkflowIds.length > 0) {
        throw new NotFoundException(
          `Workflows with IDs "${missingWorkflowIds.join(', ')}" are not associated with asset group "${groupId}"`,
        );
      }

      await Promise.all(
        associations
          .map((a) => a.jobId)
          .filter((jobId): jobId is string => Boolean(jobId))
          .map((jobId) => this.scanScheduleQueue.removeJobScheduler(jobId)),
      );
      // Remove the associations
      await this.assetGroupWorkflowRepo.remove(associations);

      return {
        message: `${associations.length} workflows successfully removed from asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error removing workflows from asset group with ID ${groupId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Updates an asset group workflow relationship (schedule, job, etc.)
   */
  async updateAssetGroupWorkflow(
    assetGroupWorkflowId: string,
    updateData: Partial<{
      schedule?: string;
      jobId?: string;
    }>,
  ): Promise<AssetGroupWorkflow> {
    try {
      // Find the existing relationship by ID
      const assetGroupWorkspace = await this.assetGroupWorkflowRepo.findOne({
        where: { id: assetGroupWorkflowId },
        relations: ['assetGroup', 'workflow'],
      });

      if (!assetGroupWorkspace) {
        throw new NotFoundException(
          `Asset group workflow relationship with ID "${assetGroupWorkflowId}" not found`,
        );
      }

      // Update the relationship with provided data
      if (updateData.schedule !== undefined) {
        assetGroupWorkspace.schedule = updateData.schedule;

        if (assetGroupWorkspace.jobId) {
          await this.scanScheduleQueue.removeJobScheduler(
            assetGroupWorkspace.jobId,
          );
        }

        if (updateData.schedule !== 'disabled') {
          const newJob = await this.scanScheduleQueue.add(
            assetGroupWorkspace.id,
            { id: assetGroupWorkspace.id } as AssetGroupWorkflow,
            {
              repeat: {
                pattern: assetGroupWorkspace.schedule,
              },
            },
          );
          if (newJob.repeatJobKey) {
            assetGroupWorkspace.jobId = newJob.repeatJobKey;
          }
        } else {
          // The old scheduler was removed above; drop the stale jobId so
          // it no longer references a removed repeat job.
          assetGroupWorkspace.jobId = null;
        }
      }

      // Save the updated relationship
      const updatedRelationship =
        await this.assetGroupWorkflowRepo.save(assetGroupWorkspace);

      return updatedRelationship;
    } catch (error) {
      this.logger.error(
        `Error updating asset group workflow relationship with ID ${assetGroupWorkflowId}:`,
        error,
      );
      throw error;
    }
  }

  public async runGroupWorkflowScheduler(
    assetGroupWorkflowId: string,
    jobRunType: JobRunType,
  ): Promise<DefaultMessageResponseDto> {
    // Get the asset group workflow to access the workflow and asset group
    const assetGroupWorkflow = await this.assetGroupWorkflowRepo
      .createQueryBuilder('assetGroupWorkflow')
      .innerJoinAndSelect('assetGroupWorkflow.workflow', 'workflow')
      .leftJoinAndSelect('workflow.workspace', 'workspace')
      .innerJoinAndSelect('assetGroupWorkflow.assetGroup', 'assetGroup')
      .where('assetGroupWorkflow.id = :assetGroupWorkflowId', {
        assetGroupWorkflowId,
      })
      .getOne();

    if (!assetGroupWorkflow) {
      throw new NotFoundException(
        `Asset group workflow with ID "${assetGroupWorkflowId}" not found`,
      );
    }

    const workflow = assetGroupWorkflow.workflow;
    const assetGroupName = assetGroupWorkflow.assetGroup.name;

    // Get all assets associated with the specific asset group workflow
    const assets = await this.assetRepo
      .createQueryBuilder('assets')
      .innerJoin('assets_group_assets', 'aga', 'aga."assetId" = assets.id')
      .innerJoin('asset_groups', 'ag', 'ag.id = aga."assetGroupId"')
      .innerJoin('asset_group_workflows', 'agw', 'agw."assetGroupId" = ag.id')
      .where('agw.id = :assetGroupWorkflowId', { assetGroupWorkflowId })
      .getMany();

    if (assets.length === 0) {
      throw new BadRequestException(
        'Asset group workflow does not have any assets associated with it.',
      );
    }

    // Get the first job's tool name
    const firstJobToolName = workflow.content.jobs[0]?.run;

    if (!firstJobToolName) {
      throw new BadRequestException('Workflow does not have any jobs defined.');
    }

    // Require tool to be installed
    const tools = await this.toolsService.getToolByNames({
      names: [firstJobToolName],
      isInstalled: true,
    });

    if (!tools || tools.length === 0) {
      throw new BadRequestException(
        `Tool "${firstJobToolName}" is not installed in the workspace.`,
      );
    }

    // Only use the first tool found (should be exactly one)
    const tool = tools[0];

    const firstJob = workflow.content.jobs[0];

    await this.jobRegistryService.createNewJob({
      tool,
      config: firstJob?.config,
      configProfileId: firstJob?.configProfileId,
      assetIds: assets.map((a) => a.id),
      workflow: workflow,
      priority: tool.priority,
      workspaceId: workflow.workspace.id,
      jobName: assetGroupName,
      jobRunType,
    });
    return {
      message: `Run scheduler for asset group workflow with ID ${assetGroupWorkflowId}`,
    };
  }

  /**
   * Removes the BullMQ repeat scheduler for an asset group workflow whose
   * group/workflow no longer resolves in the DB (orphaned schedule).
   * Used by the schedule consumer so stale jobs stop being queued.
   */
  async removeGroupWorkflowScheduler(
    repeatJobKey: string | null | undefined,
  ): Promise<void> {
    if (!repeatJobKey) {
      return;
    }
    await this.scanScheduleQueue.removeJobScheduler(repeatJobKey);
  }
}
