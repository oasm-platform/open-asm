import { BOT_ID } from '@/common/constants/app.constants';
import { JobDataResultType } from '@/common/types/app.types';
import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as crypto from 'crypto';
import { DataSource, InsertResult } from 'typeorm';
import {
  IssueSourceType,
  Severity,
  ToolCategory,
} from '../../common/enums/enum';
import { AssetService } from '../assets/entities/asset-services.entity';
import { AssetTag } from '../assets/entities/asset-tags.entity';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Port } from '../assets/entities/ports.entity';
import { IssuesService } from '../issues/issues.service';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DataAdapterInput } from './data-adapter.interface';
@Injectable()
export class DataAdapterService {
  constructor(
    private readonly dataSource: DataSource,
    private workspaceService: WorkspacesService,
    private issuesService: IssuesService,
  ) {}

  public async validateData<T extends object>(
    data: object | object[],
    cls: new () => T,
  ): Promise<boolean> {
    const arr = Array.isArray(data) ? data : [data];

    for (const item of arr) {
      const instance = plainToInstance(cls, item);
      const errors = await validate(instance as object);
      if (errors.length > 0) {
        return false;
      }
    }

    return true;
  }

  public async subdomains({
    data,
    job,
  }: DataAdapterInput<Asset[]>): Promise<InsertResult | void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const primaryAssets = data.find(
        (asset) => asset.value === job.asset.value,
      );

      // Update Asset
      await queryRunner.manager
        .createQueryBuilder()
        .update(Asset)
        .where({ id: job.asset.id })
        .set({ isPrimary: true, dnsRecords: primaryAssets?.dnsRecords })
        .execute();

      const workspaceId = await this.workspaceService.getWorkspaceIdByTargetId(
        job.asset.target.id,
      );
      const workspaceConfigs =
        await this.workspaceService.getWorkspaceConfigValue(workspaceId!);

      // const workspaceId =
      // Insert Assets
      const insertResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Asset)
        .values(
          data.map((asset) => ({
            ...asset,
            target: { id: job.asset.target.id },
            isEnabled: workspaceConfigs.isAutoEnableAssetAfterDiscovered,
          })),
        )
        .orIgnore()
        .execute();

      await queryRunner.commitTransaction();
      return insertResult;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(error);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * HTTP responses data normalization
   * @param param0
   * @returns
   */
  public async httpResponses({
    data,
    job,
  }: DataAdapterInput<HttpResponse>): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (data.failed && job.assetServiceId) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(AssetService)
          .set({ isErrorPage: true })
          .where({ id: job.assetServiceId })
          .execute();
      }

      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(HttpResponse)
        .values({
          ...data,
          assetServiceId: job.assetService?.id,
          jobHistoryId: job.jobHistory.id,
        })
        .execute();

      await queryRunner.commitTransaction();

      return;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   *
   * @param param0
   * @returns
   */
  public async portsScanner({
    data,
    job,
  }: DataAdapterInput<number[]>): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Filter out NaN values from the port array
    const filteredPorts = data.filter((port) => !isNaN(port));

    try {
      // Insert ports data
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Port)
        .values({
          ports: filteredPorts,
          assetId: job.asset.id,
          jobHistoryId: job.jobHistory.id,
        })
        .execute();

      // Insert asset services data
      if (filteredPorts && filteredPorts.length > 0) {
        const assetServices = filteredPorts.map((port) => ({
          value: `${job.asset.value}:${port}`,
          port: port,
          assetId: job.asset.id,
        }));

        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(AssetService)
          .values(assetServices)
          .orUpdate({
            conflict_target: ['assetId', 'port'],
            overwrite: ['value'],
          })
          .execute();
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    return;
  }

  /**
   * Vulnerabilities data normalization
   * @param param0
   * @returns
   */
  public async vulnerabilities({
    data,
    job,
  }: DataAdapterInput<Vulnerability[]>): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      if (data.length === 0) {
        return;
      }

      const values = data.map((vuln) => {
        const stringHash = `${vuln.name}-${job.asset.id}-${job.tool.id}`;
        const fingerprint = crypto
          .createHash('md5')
          .update(stringHash)
          .digest('hex');
        return {
          ...vuln,
          fingerprint,
          assetId: job.asset.id,
          toolId: job.tool.id,
          asset: { id: job.asset.id },
          jobHistory: { id: job.jobHistory.id },
          tool: { id: job.tool.id },
        };
      });

      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(Vulnerability)
        .values(values)
        .orUpdate({
          conflict_target: ['fingerprint'],
          overwrite: ['updatedAt', 'severity'],
        })
        .returning('*')
        .execute();

      const insertedVulnerabilities = result.raw as Vulnerability[];

      const uniqueVulnerabilities = Array.from(
        new Map(
          insertedVulnerabilities.map((vuln) => [vuln.fingerprint, vuln]),
        ).values(),
      );

      const vulsForAlert = uniqueVulnerabilities.filter(
        (vuln) =>
          vuln.severity &&
          [Severity.HIGH, Severity.CRITICAL].includes(vuln.severity),
      );

      if (vulsForAlert.length > 0) {
        await Promise.all(
          vulsForAlert.map((v) =>
            this.issuesService.createIssue(
              {
                title: `[${v.severity}] ${v.name}`,
                description: v.description,
                sourceId: v.id,
                sourceType: IssueSourceType.VULNERABILITY,
              },
              job.jobHistory.workflow?.workspace.id,
              BOT_ID,
            ),
          ),
        );
      }
    });
  }

  /**
   * Asset tags data normalization
   * @param param0
   * @returns
   * @example
   * {
   *   "tags": [
   *     {
   *       "key": "tag-key",
   *       "value": "tag-value"
   *     }
   *   ]
   * }
   */
  public async classifier({
    data,
    job,
  }: DataAdapterInput<AssetTag[]>): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(AssetTag)
      .values(
        data.map((tag) => ({
          ...tag,
          assetId: job.asset.id,
          toolId: job.tool.id,
        })),
      )
      .execute();
  }

  /**
   * Sync data based on tool category
   * @param payload Data to sync
   * @returns
   */
  public async syncData({
    job,
    data,
  }: DataAdapterInput<JobDataResultType>): Promise<void> {
    try {
      // Define type for sync function configuration
      type SyncFunctionConfig<T = unknown> = {
        handler: (data: DataAdapterInput<T>) => Promise<void | InsertResult>;
        validationClass?: new () => object;
      };

      // Map of tool categories to their corresponding sync functions and validation classes
      const syncFunctions: Partial<
        Record<ToolCategory, SyncFunctionConfig<unknown>>
      > = {
        [ToolCategory.PORTS_SCANNER]: {
          handler: (data: DataAdapterInput<number[]>) =>
            this.portsScanner(data),
        },
        [ToolCategory.SUBDOMAINS]: {
          handler: (data: DataAdapterInput<Asset[]>) => this.subdomains(data),
          // validationClass: Asset,
        },
        [ToolCategory.HTTP_PROBE]: {
          handler: (data: DataAdapterInput<HttpResponse>) =>
            this.httpResponses(data),
          // validationClass: HttpResponse, // no validate for now
        },
        [ToolCategory.VULNERABILITIES]: {
          handler: (data: DataAdapterInput<Vulnerability[]>) =>
            this.vulnerabilities(data),
          // validationClass: Vulnerability,
        },
        [ToolCategory.CLASSIFIER]: {
          handler: (data: DataAdapterInput<AssetTag[]>) =>
            this.classifier(data),
          validationClass: AssetTag,
        },
        // Note: ASSISTANT category is handled separately or not supported in this mapping
      };

      // Get the appropriate sync function based on category
      if (!job.tool.category) {
        throw new Error('Tool category is undefined');
      }

      const syncFunction = syncFunctions[job.tool.category];

      // Check if we have a function for this category
      if (!syncFunction) {
        throw new Error(`Unsupported tool category: ${job.tool.category}`);
      }

      // Validate data before syncing
      if (syncFunction.validationClass && data !== undefined) {
        const isValid = await this.validateData(
          data as object | object[],
          syncFunction.validationClass,
        );
        if (!isValid) {
          throw new Error(
            `Data validation failed for category: ${job.tool.category}`,
          );
        }
      }

      // Call the appropriate sync function with proper type assertion
      const typedData = { job, data } as unknown as DataAdapterInput<unknown>;
      await syncFunction.handler(typedData);

      return;
    } catch (error) {
      throw new Error(error);
    }
  }
}
