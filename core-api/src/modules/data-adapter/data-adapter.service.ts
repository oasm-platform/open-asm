import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JobDataResultType } from 'src/common/types/app.types';
import { DataSource, InsertResult } from 'typeorm';
import { JobStatus, ToolCategory } from '../../common/enums/enum';
import { AssetTag } from '../assets/entities/asset-tags.entity';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Port } from '../assets/entities/ports.entity';
import { Job } from '../jobs-registry/entities/job.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { DataAdapterInput } from './data-adapter.interface';

@Injectable()
export class DataAdapterService {
  constructor(private readonly dataSource: DataSource) {}

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

      // Update Job status -> COMPLETED
      await queryRunner.manager
        .createQueryBuilder()
        .update(Job)
        .set({ status: JobStatus.COMPLETED })
        .where({ id: job.id })
        .execute();

      // Insert Assets
      const insertResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Asset)
        .values(
          data.map((asset) => ({
            ...asset,
            target: { id: job.asset.target.id },
          })),
        )
        .orIgnore()
        .execute();

      await queryRunner.commitTransaction();
      return insertResult;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      await this.dataSource
        .createQueryBuilder()
        .update(Job)
        .set({ status: JobStatus.FAILED })
        .where({ id: job.id })
        .execute();

      throw error;
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
      if (data.failed) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(Asset)
          .set({ isErrorPage: true })
          .where({ id: job.asset.id })
          .execute();
      }

      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(HttpResponse)
        .values({
          ...data,
          assetId: job.asset.id,
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
   * Ports data normalization
   * @param param0
   * @returns
   */
  public async portsScanner({
    data,
    job,
  }: DataAdapterInput<number[]>): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(Port)
      .values({
        ports: data,
        assetId: job.asset.id,
        jobHistoryId: job.jobHistory.id,
      })
      .execute();

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
      // Step 1: Delete old vulnerabilities of this asset
      await manager
        .createQueryBuilder()
        .delete()
        .from(Vulnerability)
        .where('assetId = :assetId', { assetId: job.asset.id })
        .execute();

      // Step 2: Insert new vulnerabilities
      if (data.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(Vulnerability)
          .values(
            data.map((vuln) => ({
              ...vuln,
              asset: { id: job.asset.id },
              jobHistory: { id: job.jobHistory.id },
              tool: { id: job.tool.id },
            })),
          )
          .execute();
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
    // Map of tool categories to their corresponding sync functions and validation classes
    const syncFunctions = {
      [ToolCategory.PORTS_SCANNER]: {
        handler: (data: DataAdapterInput<number[]>) => this.portsScanner(data),
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
        handler: (data: DataAdapterInput<AssetTag[]>) => this.classifier(data),
        validationClass: AssetTag,
      },
    };

    // Get the appropriate sync function based on category
    if (!job.tool.category) {
      throw new Error(`Unsupported tool category: ${job.tool.category}`);
    }

    const syncFunction = syncFunctions[job.tool.category];

    // Check if we have a function for this category
    if (!syncFunction) {
      throw new Error(`Unsupported tool category: ${job.tool.category}`);
    }

    // Validate data before syncing
    if (
      'validationClass' in syncFunction &&
      syncFunction.validationClass &&
      data !== undefined
    ) {
      const isValid = await this.validateData(
        data as object | object[],
        syncFunction.validationClass as new () => object,
      );
      if (!isValid) {
        Logger.error('Invalid data', job.category);
        throw new BadRequestException(
          `Data validation failed for category: ${job.tool.category}`,
        );
      }
    }

    // Call the appropriate sync function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await syncFunction.handler({ job, data } as DataAdapterInput<any>);

    return;
  }
}
