import { Injectable } from '@nestjs/common';
import { DataSource, InsertResult } from 'typeorm';
import { ToolCategory } from '../../common/enums/enum';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Port } from '../assets/entities/ports.entity';
import { DataAdapterInput } from './data-adapter.interface';

@Injectable()
export class DataAdapterService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Subdomains data normalization
   * @param param0
   * @returns
   */
  public async subdomains({
    data,
    job,
  }: DataAdapterInput): Promise<InsertResult> {
    return this.dataSource
      .createQueryBuilder()
      .insert()
      .into(Asset)
      .values(
        data.map((asset) => ({
          ...asset,
          target: { id: job.asset.id },
        })),
      )
      .execute();
  }

  /**
   * HTTP responses data normalization
   * @param param0
   * @returns
   */
  public async httpResponses({
    data,
    job,
  }: DataAdapterInput): Promise<InsertResult> {
    return this.dataSource
      .createQueryBuilder()
      .insert()
      .into(HttpResponse)
      .values({
        ...data,
        assetId: job.asset.id,
        jobHistoryId: job.jobHistory.id,
      })
      .execute();
  }

  /**
   * Ports data normalization
   * @param param0
   * @returns
   */
  public async portsScanner({
    data,
    job,
  }: DataAdapterInput): Promise<InsertResult> {
    return this.dataSource
      .createQueryBuilder()
      .insert()
      .into(Port)
      .values(
        data.map((port) => ({
          ...port,
          assetId: job.asset.id,
          jobHistoryId: job.jobHistory.id,
        })),
      )
      .execute();
  }

  /**
   * Sync data based on tool category
   * @param data Data to sync
   * @returns
   */
  public async syncData(data: DataAdapterInput): Promise<any> {
    // Map of tool categories to their corresponding sync functions
    const syncFunctions = {
      [ToolCategory.SUBDOMAINS]: (data: DataAdapterInput) =>
        this.subdomains(data),
      [ToolCategory.HTTP_PROBE]: (data: DataAdapterInput) =>
        this.httpResponses(data),
      [ToolCategory.HTTP_SCRAPER]: (data: DataAdapterInput) =>
        this.httpResponses(data),
      [ToolCategory.PORTS_SCANNER]: (data: DataAdapterInput) =>
        this.portsScanner(data),
      [ToolCategory.VULNERABILITIES]: (data: DataAdapterInput) => {
        throw new Error(`Vulnerabilities sync not implemented yet`);
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
    return syncFunction(data);
  }
}
