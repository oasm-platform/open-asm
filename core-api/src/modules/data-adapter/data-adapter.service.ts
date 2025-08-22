import { Injectable } from '@nestjs/common';
import { DataSource, InsertResult } from 'typeorm';
import { JobStatus, ToolCategory } from '../../common/enums/enum';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Port } from '../assets/entities/ports.entity';
import { Job } from '../jobs-registry/entities/job.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { DataAdapterInput } from './data-adapter.interface';

@Injectable()
export class DataAdapterService {
  constructor(private readonly dataSource: DataSource) {}

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
  }: DataAdapterInput<Vulnerability[]>): Promise<InsertResult> {
    return this.dataSource
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

  /**
   * Sync data based on tool category
   * @param data Data to sync
   * @returns
   */
  public async syncData(
    data: DataAdapterInput<Asset[] | HttpResponse | number[] | Vulnerability[]>,
  ): Promise<void> {
    // Map of tool categories to their corresponding sync functions
    const syncFunctions = {
      [ToolCategory.PORTS_SCANNER]: (data: DataAdapterInput<number[]>) =>
        this.portsScanner(data),
      [ToolCategory.SUBDOMAINS]: (data: DataAdapterInput<Asset[]>) =>
        this.subdomains(data),
      [ToolCategory.HTTP_PROBE]: (data: DataAdapterInput<HttpResponse>) =>
        this.httpResponses(data),
      [ToolCategory.HTTP_SCRAPER]: (data: DataAdapterInput<HttpResponse>) =>
        this.httpResponses(data),
      [ToolCategory.VULNERABILITIES]: (
        data: DataAdapterInput<Vulnerability[]>,
      ) => {
        return this.vulnerabilities(data);
      },
    };

    // Get the appropriate sync function based on category
    if (!data.job.tool.category) {
      throw new Error(`Unsupported tool category: ${data.job.tool.category}`);
    }

    const syncFunction = syncFunctions[data.job.tool.category];

    // Check if we have a function for this category
    if (!syncFunction) {
      throw new Error(`Unsupported tool category: ${data.job.tool.category}`);
    }

    // Call the appropriate sync function
    await syncFunction(data as DataAdapterInput<any>);

    return;
  }
}
